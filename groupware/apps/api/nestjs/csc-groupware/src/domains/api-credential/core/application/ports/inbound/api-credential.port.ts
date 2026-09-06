import { ApiCredentialView } from '../../../domain';

/**
 * 공용 API 자격증명 Inbound Port: 조직 스코프
 * UI 용(뷰/등록/삭제)과 내부용(자격증명 해석)을 분리한다.
 * 내부용(resolveCredentials)은 다른 도메인이 주입해 호출하며 컨트롤러로 노출하지 않는다.
 */
export interface ApiCredentialPort {
  /** UI: 조직의 모든 프로바이더 자격증명 뷰(값 제외) */
  listViewsForOrg(organizationId: number): Promise<ApiCredentialView[]>;

  /**
   * 논-시크릿: 조직에서 실제로 쓸 수 있는 프로바이더 key 목록(카탈로그가 선언한 자격증명 필드가
   * 모두 채워진 것만. 필드가 둘인 플랫폼 키는 한쪽만 차 있으면 제외된다)
   * 값/설정 필드명 없이 provider 문자열만 반환한다. 마케팅 AI 모델 게이팅처럼
   * ROOT 가 아닌 조직 편집자(예: 팀장)도 "어떤 키가 등록됐나"만 알면 되는 곳에서 쓴다.
   */
  listConfiguredProviders(organizationId: number): Promise<string[]>;

  /**
   * UI: 프로바이더 자격증명 등록/교체
   * 저장 전 카탈로그에 있는 provider 인지, 그 프로바이더의 필드가 다 찼는지 보고, 확인용 호출
   * 경로가 있는 프로바이더는 발급처에 실검증까지 한다(예: Claude API 키 유효성). 통과하면
   * 암호화 저장한다. 어느 단계든 실패하면 예외를 던진다(어댑터가 400 으로 변환)
   */
  saveCredential(
    organizationId: number,
    provider: string,
    credentials: Record<string, string>,
  ): Promise<ApiCredentialView>;

  /** UI: 프로바이더 자격증명 삭제(등록 해제) */
  deleteCredential(organizationId: number, provider: string): Promise<void>;

  /** 내부: 복호화된 자격증명 맵(없으면 null). 컨트롤러 미노출 */
  resolveCredentials(
    organizationId: number,
    provider: string,
  ): Promise<Record<string, string> | null>;
}

export const API_CREDENTIAL_PORT = Symbol('API_CREDENTIAL_PORT');
