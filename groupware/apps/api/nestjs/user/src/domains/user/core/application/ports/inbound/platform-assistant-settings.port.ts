import {
  PlatformAssistantSettings,
  UpdatePlatformAssistantSettingsInput,
} from '../../../domain/types';

/**
 * 플랫폼 AI 어시스턴트 전역 설정 Inbound Port: 플랫폼(csc-control-tower)이 조회/수정한다.
 * userdb 싱글톤이라 조회는 항상 1행, 수정은 제공된 필드만 반영. 설계: .claude/rules/multi-tenancy.md
 */
export interface PlatformAssistantSettingsPort {
  getSettings(): Promise<PlatformAssistantSettings>;
  updateSettings(patch: UpdatePlatformAssistantSettingsInput): Promise<PlatformAssistantSettings>;
}

export const PLATFORM_ASSISTANT_SETTINGS_PORT = Symbol('PLATFORM_ASSISTANT_SETTINGS_PORT');
