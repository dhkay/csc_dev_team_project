// 조직 AI 어시스턴트 설정: csc-groupware `/assistant-settings` 응답/입력 형태
//   모델 선택은 조직 몫이다(플랫폼 허용 목록 없음). 미설정이면 내장 Qwen 이 기본이 된다.
export interface OrganizationAssistantSettings {
  // 조직 기본 모델 key. null=미설정(내장 Qwen)
  defaultModel: string | null;
  // 조직 프롬프트 추가(공통 프롬프트 뒤에 이어붙음). null=없음
  promptAddition: string | null;
}

/** 수정 입력: 제공된 필드만. null 로 해제 */
export interface UpdateOrganizationAssistantSettingsInput {
  defaultModel?: string | null;
  promptAddition?: string | null;
}

/** 조직 기본 모델 select 후보: language-model 카탈로그 전체(모델 SSOT) */
export interface AssistantModelOption {
  key: string;
  label: string;
  vendor: string | null;
  // "self"(자체) | "api"(외부 벤더: 조직 API 키 필요)
  serving: string;
}
