import { Inject, Injectable } from '@nestjs/common';
import { AiToolResolved } from '../../domain/ai-tool.types';
import { EntitlementPort } from '../ports/inbound/entitlement.port';
import {
  EntitlementUserApiPort,
  ENTITLEMENT_USER_API_PORT,
} from '../ports/outbound/user-api.port';

/**
 * EntitlementPort 구현: 조직 AI도구 부여 조회를 user 서버에 위임한다.
 * 엔타이틀먼트(ai_tools/organization_ai_tools)는 userdb(=user 서버) 소유: csc-groupware 는
 * 게이트(서비스토큰) + 위임만 하고 직접 보유하지 않는다.
 */
@Injectable()
export class EntitlementService implements EntitlementPort {
  constructor(
    @Inject(ENTITLEMENT_USER_API_PORT)
    private readonly userApi: EntitlementUserApiPort,
  ) {}

  async getOrganizationAiTools(organizationId: number): Promise<AiToolResolved[]> {
    return this.userApi.getOrganizationAiTools(organizationId);
  }
}
