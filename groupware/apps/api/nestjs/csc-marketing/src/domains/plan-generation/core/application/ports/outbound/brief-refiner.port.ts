import type { RefinedBrief } from '../../../domain';
import type { PlanGenerationUsage } from './plan-generator.port';

/**
 * 입력 정제 입력. 프롬프트 재료가 없음(키워드 보완과 같은 모양)
 * 조립은 그 버전의 조립기가 하고 이 포트 구현은 호출과 파싱만 한다. 어댑터가 조립하면 버전을
 * 알아야 하고 조립기의 segments() 계약이 우연히만 성립함
 */
export interface BriefRefinementContext {
  organizationId: number;
  // 조립이 끝난 시스템/유저 프롬프트
  systemPrompt: string;
  userPrompt: string;
  // 정제에 쓸 LLM 모델 id. 파이프라인 표가 정한 고정값이라 빈 값이 오지 않는다.
  model: string;
}

/**
 * 정제 결과: 구조화된 정제본 + 사용량
 * 사용량을 싣는 이유는 기획 생성과 같다. 유료 호출이라 원장에 금액이 남아야 한다.
 */
export interface BriefRefinementResult {
  refined: RefinedBrief;
  // 구 버전 language-model 이면 null. 0 으로 위장하지 않음
  usage: PlanGenerationUsage | null;
}

/**
 * 입력 정제 아웃바운드 포트: 조립된 프롬프트 → 파이프라인이 읽는 동영상 단위 구조
 * 구현은 language-model 호출 하나다. 버전별 어댑터가 아닌 이유: 응답 스키마가 이 도메인의 것이라
 * 버전과 무관하고, 갈리는 것(무엇을 물을지)은 조립기가 이미 갖고 있다.
 */
export interface BriefRefinerPort {
  refine(context: BriefRefinementContext): Promise<BriefRefinementResult>;
}

export const BRIEF_REFINER_PORT = Symbol('BRIEF_REFINER_PORT');
