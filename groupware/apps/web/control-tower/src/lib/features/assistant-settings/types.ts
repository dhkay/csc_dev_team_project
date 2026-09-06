// 플랫폼 AI 어시스턴트 전역 설정: csc-control-tower `/platform/assistant-settings` 응답/입력과 동일 형태
//   플랫폼이 정하는 건 "쓸 수 있나(킬스위치)"와 "어떤 성격인가(공통 프롬프트)" 둘뿐이다.
//   어떤 모델을 쓸지는 각 조직이 정하고(그룹웨어 조직 관리), 조직도 안 정하면 내장 Qwen 으로 떨어진다.
export interface PlatformAssistantSettings {
  // 전역 활성화(킬스위치)
  globalEnabled: boolean;
  // 공통 시스템 프롬프트/페르소나. null=미설정
  commonPrompt: string | null;
}

/** 수정 입력: 제공된 필드만. commonPrompt 는 null 로 해제 */
export interface UpdatePlatformAssistantSettingsInput {
  globalEnabled?: boolean;
  commonPrompt?: string | null;
}
