import { PlatformAssistantSettings } from '../../../domain/types/assistant-settings.types';

/**
 * 플랫폼 전역 AI 어시스턴트 설정 게이트웨이: userdb 소유(user 서버)라 HTTP 로 fetch.
 * csc-groupware→user 는 이미 wired(공유 UserApiClientService). 병합 resolve 에서 사용
 */
export interface PlatformAssistantSettingsGatewayPort {
  getPlatformSettings(): Promise<PlatformAssistantSettings>;
}

export const PLATFORM_ASSISTANT_SETTINGS_GATEWAY_PORT = Symbol(
  'PLATFORM_ASSISTANT_SETTINGS_GATEWAY_PORT',
);
