import { AiToolResolved } from '../../../domain/ai-tool.types';

/** 엔타이틀먼트 Inbound Port: Controller 가 이 Port 로 Service 를 호출한다. */
export interface EntitlementPort {
  /** 조직에 부여된 AI도구(표시명+slug 포함, 플랫폼 부여) */
  getOrganizationAiTools(organizationId: number): Promise<AiToolResolved[]>;
}

export const ENTITLEMENT_PORT = Symbol('ENTITLEMENT_PORT');
