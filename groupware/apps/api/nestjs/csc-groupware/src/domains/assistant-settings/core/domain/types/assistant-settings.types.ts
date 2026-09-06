/**
 * AI 어시스턴트 설정 도메인 타입 (csc-groupware)
 * 조직별 오버라이드(groupwaredb 소유) + 플랫폼 전역 설정(user 소유, fetch) + 병합 결과(effective)
 * 채팅 시점 병합 SSOT = 이 도메인의 resolve. 설계: .claude/rules/multi-tenancy.md
 */

/** 조직별 AI 어시스턴트 설정: groupwaredb organization_assistant_settings. */
export interface OrganizationAssistantSettings {
  // 조직 기본 모델 key. null=미설정(내장 Qwen = language-model 카탈로그 기본)
  defaultModel: string | null;
  // 조직 프롬프트 추가(공통 프롬프트 뒤에 이어붙음). null=없음
  promptAddition: string | null;
}

/** 조직 설정 수정 입력: 제공된 필드만 */
export interface UpdateOrganizationAssistantSettingsInput {
  defaultModel?: string | null;
  promptAddition?: string | null;
}

/**
 * 플랫폼 전역 설정: user `/internal/platform-assistant-settings` 응답 형태(fetch)
 * 플랫폼은 "쓸 수 있나(킬스위치)"와 "어떤 성격인가(공통 프롬프트)"만 정한다: 모델 선택은 조직 몫
 */
export interface PlatformAssistantSettings {
  globalEnabled: boolean;
  commonPrompt: string | null;
}

/** 모델 유니버스 항목: language-model `/inference/models`. 조직 기본 모델 select 후보 */
export interface AssistantModelOption {
  key: string;
  label: string;
  vendor: string | null;
  // "self"(자체) | "api"(외부 벤더: 조직 API 키 필요)
  serving: string;
}

/** 병합 결과(effective): language-model 이 채팅 시점에 적용하는 최종 설정 */
export interface EffectiveAssistantConfig {
  // 전역 킬스위치. false 면 어시스턴트 사용 불가
  enabled: boolean;
  // 조직 기본 모델. null=미설정 → language-model 카탈로그 기본(내장 Qwen)
  defaultModel: string | null;
  // 합성 시스템 프롬프트(공통 + 조직 추가). null=기본값 사용
  systemPrompt: string | null;
}
