import {
  PlatformAssistantSettings,
  UpdatePlatformAssistantSettingsInput,
} from '../../../domain/assistant-settings.types';

/**
 * 플랫폼 AI 어시스턴트 전역 설정 Inbound Port (control-tower): 플랫폼 관리자가 조회/수정
 * userdb 싱글톤 소유(user)라 user 서버에 위임한다(소유권)
 */
export interface AssistantSettingsPort {
  getSettings(): Promise<PlatformAssistantSettings>;
  updateSettings(patch: UpdatePlatformAssistantSettingsInput): Promise<PlatformAssistantSettings>;
}

export const ASSISTANT_SETTINGS_PORT = Symbol('PLATFORM_ASSISTANT_SETTINGS_PORT');
