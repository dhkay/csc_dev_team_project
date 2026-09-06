import {
  OrganizationAssistantSettings,
  UpdateOrganizationAssistantSettingsInput,
} from '../../../domain/types/assistant-settings.types';

/** 조직별 AI 어시스턴트 설정 레포지토리 (groupwaredb). 조직당 최대 1행 */
export interface AssistantSettingsRepositoryPort {
  /** 조직 설정 조회. 없으면 null(리졸버/서비스가 기본값 처리) */
  findRecordByOrganizationId(
    organizationId: number,
  ): Promise<OrganizationAssistantSettings | null>;
  /** 조직 설정 upsert(제공된 필드만): 반환: 반영된 전체 설정 */
  upsertRecordByOrganizationId(
    organizationId: number,
    patch: UpdateOrganizationAssistantSettingsInput,
  ): Promise<OrganizationAssistantSettings>;
}

export const ASSISTANT_SETTINGS_REPOSITORY_PORT = Symbol('ASSISTANT_SETTINGS_REPOSITORY_PORT');
