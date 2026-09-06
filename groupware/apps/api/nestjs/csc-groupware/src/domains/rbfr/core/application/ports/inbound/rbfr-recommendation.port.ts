import type { RecommendIngredientsResult, TargetRatioInput } from '../../../domain/types';

/** 02_화면구성.md 탭2 "역방향 추천" 화면이 호출하는 진입점. */
export interface RbfrRecommendationPort {
  /** 목표 역할 비중(도메인별 %)에 가까운 원료를 상위 10개 추천한다. */
  recommendIngredients(targetRatios: TargetRatioInput[]): Promise<RecommendIngredientsResult>;
}

export const RBFR_RECOMMENDATION_PORT = Symbol('RBFR_RECOMMENDATION_PORT');
