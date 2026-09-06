import {
  AssistantModelOption,
  EffectiveAssistantConfig,
  OrganizationAssistantSettings,
  UpdateOrganizationAssistantSettingsInput,
} from '../../../domain/types/assistant-settings.types';

/**
 * AI 어시스턴트 설정 Inbound Port (csc-groupware)
 *  - getForOrg/updateForOrg: 조직 관리자(그룹웨어)용 조직 오버라이드 조회/수정
 *  - listModels: 조직 기본 모델 select 후보(language-model 카탈로그 전체)
 *  - resolveEffective: language-model 이 채팅 시점에 쓰는 병합 결과(조직 + 플랫폼)
 */
export interface AssistantSettingsPort {
  getForOrg(organizationId: number): Promise<OrganizationAssistantSettings>;
  updateForOrg(
    organizationId: number,
    patch: UpdateOrganizationAssistantSettingsInput,
  ): Promise<OrganizationAssistantSettings>;
  listModels(): Promise<AssistantModelOption[]>;
  resolveEffective(organizationId: number): Promise<EffectiveAssistantConfig>;
}

export const ASSISTANT_SETTINGS_PORT = Symbol('ASSISTANT_SETTINGS_PORT');
