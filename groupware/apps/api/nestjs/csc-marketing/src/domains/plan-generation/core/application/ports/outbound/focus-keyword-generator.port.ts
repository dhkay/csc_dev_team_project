/**
 * 포커스 키워드 보완 생성 입력. 프롬프트 재료가 없음
 * 어댑터가 조립하면 그 버전의 문구를 알아야 하고 조립기의 segments() 계약이 우연히만 성립함
 * 그래서 기획 프롬프트와 같은 모양으로 서비스가 조립해 넘김
 */
export interface FocusKeywordContext {
  organizationId: number;
  // 조립이 끝난 시스템/유저 프롬프트. 조립은 그 버전의 조립기가 한다.
  systemPrompt: string;
  userPrompt: string;
  // 더 만들어야 하는 개수. 0 이면 서비스가 호출하지 않음
  // 프롬프트에 있는데 따로 받는 이유는 파싱 상한이기도 하기 때문(초과분은 아무도 고르지 않은 후보)
  needed: number;
  // 이 버전이 부를 LLM 모델 id. 빈 값이면 서버 기본 모델
  model: string;
}

/**
 * 포커스 키워드 보완 생성 아웃바운드 포트: 조립된 프롬프트 → 모자란 만큼의 후보
 * 프롬프트는 버전별 조립기가 소유하고, 이 포트 구현은 호출과 파싱만 한다.
 */
export interface FocusKeywordGeneratorPort {
  suggest(context: FocusKeywordContext): Promise<string[]>;
}

export const FOCUS_KEYWORD_GENERATOR_PORT = Symbol('FOCUS_KEYWORD_GENERATOR_PORT');
