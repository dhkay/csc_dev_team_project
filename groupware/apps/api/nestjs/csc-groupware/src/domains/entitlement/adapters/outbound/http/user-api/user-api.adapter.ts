import { Injectable } from '@nestjs/common';
import { UserApiClientService } from '../../../../../../shared/adapters/outbound/user-api';
import { AiToolResolved } from '../../../../core/domain/ai-tool.types';
import { EntitlementUserApiPort } from '../../../../core/application/ports/outbound/user-api.port';

/** EntitlementUserApiPort 구현: user 서버 /internal/organizations/:id/ai-tools/resolved 호출(서비스토큰) */
@Injectable()
export class EntitlementUserApiAdapter implements EntitlementUserApiPort {
  constructor(private readonly client: UserApiClientService) {}

  getOrganizationAiTools(organizationId: number): Promise<AiToolResolved[]> {
    return this.client.get<AiToolResolved[]>(
      `/internal/organizations/${organizationId}/ai-tools/resolved`,
    );
  }
}
