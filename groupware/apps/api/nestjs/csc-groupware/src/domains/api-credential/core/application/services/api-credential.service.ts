import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  ApiCredentialView,
  ApiProviderMeta,
  findApiProvider,
  hasRequiredCredentials,
  requiredCredentialFields,
} from '../../domain';
import { ApiCredentialPort } from '../ports/inbound';
import {
  ApiCredentialRecord,
  ApiCredentialRepositoryPort,
  API_CREDENTIAL_REPOSITORY_PORT,
  ApiKeyValidatorPort,
  API_KEY_VALIDATOR_PORT,
  SecretCipherPort,
  SECRET_CIPHER_PORT,
} from '../ports/outbound';

/**
 * ApiCredentialPort 구현: 조직별 공용 API 자격증명
 *
 * 저장은 세 단계를 통과해야 한다: 카탈로그(`@csc/api-providers`)에 있는 provider 인가, 그
 * 프로바이더의 필수 필드가 다 찼는가, 발급처 실검증을 통과하는가. 확인용 호출 경로가 없는
 * 프로바이더는 셋째 단계가 형식 확인으로 끝난다(카탈로그 verification:'format')
 *
 * 통과하면 JSON→암호화해 저장한다. UI 응답(view)엔 값 대신 configuredFields(설정된 키 목록)만
 * 담는다. HTTP 상태 변환은 어댑터(예외→400) 책임
 */
@Injectable()
export class ApiCredentialService implements ApiCredentialPort {
  constructor(
    @Inject(API_CREDENTIAL_REPOSITORY_PORT)
    private readonly repository: ApiCredentialRepositoryPort,
    @Inject(SECRET_CIPHER_PORT)
    private readonly cipher: SecretCipherPort,
    @Inject(API_KEY_VALIDATOR_PORT)
    private readonly validator: ApiKeyValidatorPort,
  ) {}

  async listViewsForOrg(organizationId: number): Promise<ApiCredentialView[]> {
    const records = await this.repository.findManyRecordsByOrg(organizationId);
    return records.map((r) => this.toView(r));
  }

  async listConfiguredProviders(organizationId: number): Promise<string[]> {
    const views = await this.listViewsForOrg(organizationId);
    // 등록 완료 기준은 카탈로그가 정한다(단순 행 존재도, 필드 하나도 아니다). 필드가 둘인
    // 플랫폼 키는 둘 다 차야 사용 가능이다. 화면의 "등록됨" 배지도 같은 함수를 본다.
    // 카탈로그에 없는 provider(내린 구 프로바이더의 잔여 행)는 아무 모델도 요구하지 않으므로 뺀다.
    return views
      .filter((v) => {
        const meta = findApiProvider(v.provider);
        return meta ? hasRequiredCredentials(meta, v.configuredFields) : false;
      })
      .map((v) => v.provider);
  }

  async saveCredential(
    organizationId: number,
    provider: string,
    credentials: Record<string, string>,
  ): Promise<ApiCredentialView> {
    // 카탈로그에 없는 provider 는 받지 않는다. 받아 두면 저장은 되지만 어느 모델도 그 키를 찾지
    // 못해 영원히 미등록으로 보이고, 등록한 사람은 이유를 알 수 없다.
    const meta = findApiProvider(provider);
    if (!meta) {
      throw new BadRequestException('알 수 없는 API 프로바이더입니다.');
    }

    // 카탈로그가 선언한 필드만 담는다. 그 밖의 값은 아무도 읽지 않으면서 암호문에 남고
    // configuredFields 로 화면에 드러난다. 공백 값은 미입력으로 취급해 버린다.
    const cleaned: Record<string, string> = {};
    for (const field of meta.credentialFields) {
      const value = credentials[field.key];
      if (typeof value !== 'string' || value.trim() === '') continue;
      const trimmed = value.trim();
      // 숫자 필드(분당 한도)는 양수만 받는다. 0 이나 문자가 저장되면 렌더 워커가 그 값을 읽어
      //   간격을 0 으로 접거나 무시하는데, 등록한 사람은 값이 먹은 줄 안다.
      if (field.kind === 'number' && !(Number(trimmed) > 0 && Number.isFinite(Number(trimmed)))) {
        throw new BadRequestException(`${field.label}은(는) 0 보다 큰 숫자여야 합니다.`);
      }
      cleaned[field.key] = trimmed;
    }
    this.assertRequiredFieldsPresent(meta, cleaned);

    // 저장 전 실검증(프로바이더별). 통과해야만 암호화 저장한다.
    const result = await this.validator.validate(provider, cleaned);
    if (!result.valid) {
      throw new BadRequestException(result.message ?? 'API 키 검증에 실패했습니다.');
    }

    const record = await this.repository.upsertRecord(organizationId, provider, {
      enabled: true,
      credentialsCipher: this.cipher.encrypt(JSON.stringify(cleaned)),
    });
    return this.toView(record);
  }

  async deleteCredential(organizationId: number, provider: string): Promise<void> {
    await this.repository.deleteRecord(organizationId, provider);
  }

  async resolveCredentials(
    organizationId: number,
    provider: string,
  ): Promise<Record<string, string> | null> {
    const record = await this.repository.findOneRecord(organizationId, provider);
    if (!record?.credentialsCipher) return null;
    const map = this.decryptMap(record.credentialsCipher);
    return Object.keys(map).length > 0 ? map : null;
  }

  /**
   * 필수 필드가 모두 찼는지 확인한다. 프론트의 저장 버튼도 같은 조건을 걸지만, 그것은 편의이고
   * 판정은 서버가 한다. 한쪽만 채워진 플랫폼 키가 저장되면 등록 화면에는 등록된 것처럼 보이면서
   * 호출은 계속 실패한다.
   */
  private assertRequiredFieldsPresent(
    meta: ApiProviderMeta,
    cleaned: Record<string, string>,
  ): void {
    const missing = requiredCredentialFields(meta).filter((f) => !cleaned[f.key]);
    if (missing.length > 0) {
      throw new BadRequestException(
        `필수 항목이 비어 있습니다: ${missing.map((f) => f.label).join(', ')}`,
      );
    }
  }

  private toView(record: ApiCredentialRecord): ApiCredentialView {
    const map = record.credentialsCipher ? this.decryptMap(record.credentialsCipher) : {};
    return {
      provider: record.provider,
      enabled: record.enabled,
      configuredFields: Object.keys(map),
      publicValues: this.publicValuesOf(record.provider, map),
      updatedAt: record.updatedAt ? record.updatedAt.toISOString() : null,
    };
  }

  /**
   * 비밀이 아닌 필드의 값만 추린다.
   *
   * 카탈로그를 화이트리스트로 쓴다(맵을 훑어 걸러내지 않는다). 저장된 맵에는 카탈로그에서
   * 내려간 옛 필드가 남아 있을 수 있는데, 그런 값은 지금 비밀인지 아닌지 아무도 선언하지 않은
   * 상태다. 판단할 근거가 없으면 내보내지 않는 쪽이 맞다. 카탈로그에 없는 provider 도 같은 이유로
   * 빈 맵이 된다.
   */
  private publicValuesOf(
    provider: string,
    map: Record<string, string>,
  ): Record<string, string> {
    const meta = findApiProvider(provider);
    if (!meta) return {};
    const out: Record<string, string> = {};
    for (const field of meta.credentialFields) {
      if (field.secret === false && typeof map[field.key] === 'string') {
        out[field.key] = map[field.key];
      }
    }
    return out;
  }

  /** 암호문 → 맵. 키 미설정/변조 등으로 실패하면 빈 맵(미설정 취급) */
  private decryptMap(cipher: string): Record<string, string> {
    try {
      const parsed = JSON.parse(this.cipher.decrypt(cipher)) as unknown;
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, string>;
      }
      return {};
    } catch {
      return {};
    }
  }
}
