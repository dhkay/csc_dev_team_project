import { AiToolResolved } from '../../../domain/ai-tool.types';

/**
 * user 서버(엔타이틀먼트 SSoT 소유) 위임 Outbound Port.
 * ai_tools / organization_ai_tools 는 userdb(=user 서버) 소유: csc-groupware 는 위임 조회만 한다.
 */
export interface EntitlementUserApiPort {
  /** 조직에 부여된 AI도구(표시명+slug 포함) 조회 */
  getOrganizationAiTools(organizationId: number): Promise<AiToolResolved[]>;
}

export const ENTITLEMENT_USER_API_PORT = Symbol('ENTITLEMENT_USER_API_PORT');
