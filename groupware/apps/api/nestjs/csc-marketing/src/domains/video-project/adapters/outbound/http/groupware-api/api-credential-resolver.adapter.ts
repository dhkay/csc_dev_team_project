import { Injectable, Logger } from '@nestjs/common';
import { GroupwareApiClientService } from '../../../../../../shared/adapters/outbound/groupware-api';
import { ApiCredentialResolverPort } from '../../../../core/application/ports/outbound';

/**
 * ApiCredentialResolverPort 구현: csc-groupware `GET /internal/api-credentials/resolve`.
 * 응답은 복호화된 자격증명 맵(예: { apiKey }) 또는 null(미등록). 조회 실패(장애)는 삼켜 null 로
 * 외부 provider 로 라우팅하지 않고 기본 씬 비주얼로 폴백시켜 렌더 자체는 막지 않는다.
 * 복호화된 키는 여기서만 잠깐 다뤄지고, 잡 params 에는 암호문으로 실린다(JobCredentialCipher)
 */
@Injectable()
export class ApiCredentialResolverAdapter implements ApiCredentialResolverPort {
  private readonly logger = new Logger(ApiCredentialResolverAdapter.name);

  constructor(private readonly client: GroupwareApiClientService) {}

  async resolveCredentials(
    organizationId: number,
    provider: string,
  ): Promise<Record<string, string> | null> {
    try {
      const res = await this.client.get<Record<string, string> | null>(
        `/internal/api-credentials/resolve?organizationId=${organizationId}` +
          `&provider=${encodeURIComponent(provider)}`,
      );
      return res && typeof res === 'object' ? res : null;
    } catch (err) {
      this.logger.warn(
        `조직 자격증명 resolve 실패(org=${organizationId}, provider=${provider}): ${String(err)}`,
      );
      return null;
    }
  }
}
