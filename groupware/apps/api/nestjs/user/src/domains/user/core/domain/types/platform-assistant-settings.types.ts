/**
 * 플랫폼 AI 어시스턴트 전역 설정: userdb 싱글톤(platform_assistant_settings)의 도메인 표현
 * 플랫폼 관리자(control-tower)가 편집하는 전 조직 공통 기준. 조직별 오버라이드는 groupware,
 * 채팅 시점 병합은 csc-groupware resolve. 설계: .claude/rules/multi-tenancy.md
 *
 * 플랫폼이 정하는 건 "쓸 수 있나(킬스위치)"와 "어떤 성격인가(공통 프롬프트)" 둘뿐이다.
 * 모델 선택은 조직 몫(organization_assistant_settings.default_model), 그마저 없으면 내장 Qwen.
 */
export interface PlatformAssistantSettings {
  // 전역 활성화(킬스위치): false 면 조직/유저 무관 차단
  globalEnabled: boolean;
  // 공통 시스템 프롬프트/페르소나. 미설정 null.
  commonPrompt: string | null;
}

/** 플랫폼 어시스턴트 설정 수정 입력: 제공된 필드만 반영 */
export interface UpdatePlatformAssistantSettingsInput {
  globalEnabled?: boolean;
  commonPrompt?: string | null;
}
