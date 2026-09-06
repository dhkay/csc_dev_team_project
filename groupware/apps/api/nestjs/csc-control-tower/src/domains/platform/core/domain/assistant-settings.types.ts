/**
 * 플랫폼 AI 어시스턴트 전역 설정. user 서버 `/internal/platform-assistant-settings` 와 같은 형태다.
 * userdb 싱글톤 소유(user)이고 control-tower 는 게이트 + 위임만 한다.
 *
 * 전역 설정은 킬스위치와 공통 프롬프트 둘뿐이다. 플랫폼은 모델 목록을 다루지 않는다.
 */
export interface PlatformAssistantSettings {
  globalEnabled: boolean;
  commonPrompt: string | null;
}

/** 플랫폼 어시스턴트 설정 수정 위임 입력: 제공된 필드만 */
export interface UpdatePlatformAssistantSettingsInput {
  globalEnabled?: boolean;
  commonPrompt?: string | null;
}
