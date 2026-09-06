/**
 * RBFR 계산 엔진 — 순수 도메인 타입.
 *
 * 이 파일은 05_스코어링엔진.md의 계산식이 다루는 값만 정의한다. NestJS/Drizzle 등
 * 프레임워크·ORM을 import하지 않는다(그룹웨어 헥사고날 원칙 "core는 프레임워크를 모른다"와
 * 동일). 나중에 groupware 저장소로 옮길 때 core/domain/types/rbfr.types.ts로 거의 그대로
 * 이동할 수 있도록, 처음부터 이 제약을 지킨다(groupware 맞춤 설계용 파일지침.md §7).
 */

/** 역할 도메인 종류. DIRECT는 원료 기여도로 계산, INTEGRATED(균형)는 독립 근거로만 채워진다. */
export type RoleDomainType = 'DIRECT' | 'INTEGRATED';

/** 처방에 실제로 들어간 원료 한 줄(배합비율 %). */
export interface FormulaIngredientInput {
  ingredientId: string;
  /** 실제 배합비율(%). 0~100. */
  percent: number;
}

/** 성분 × 역할 기여도(rbfr_ingredient_roles.contribution, 0~100, 역할마다 독립값). */
export interface IngredientRoleContribution {
  ingredientId: string;
  domainCode: string;
  contribution: number;
}

/**
 * 원료쌍 조합 계수(rbfr_ingredient_interactions.coefficient).
 * 1.0=변화 없음, 1.1=10% 상승, 0.9=10% 감소, 0=사용 불가.
 */
export interface InteractionCoefficient {
  ingredientAId: string;
  ingredientBId: string;
  domainCode: string;
  coefficient: number;
}

/** 원료의 권장 최소 사용량(%, rbfr_ingredients.recommended_min_percent). 없으면 감쇠 미적용. */
export interface ConcentrationLimit {
  ingredientId: string;
  recommendedMinPercent?: number;
}

/** 통합역할(균형) 입력. 근거가 없으면 value는 무시되고 비중값 계산에서 제외된다(05번 원칙5). */
export interface IntegratedRoleInput {
  domainCode: string;
  hasEvidence: boolean;
  value: number;
}

/** 직접역할 하나의 산출 결과. 각 보정계수를 그대로 남겨 화면에서 "보정 반영됨/없음"을 구분한다. */
export interface DirectRoleEfficacyResult {
  domainCode: string;
  /** 1단계: Σ(기여도 × 배합비/100), 가산 방식. */
  baseValue: number;
  /** 2단계: 이 처방에 실제로 같이 들어간 원료쌍의 조합 계수를 전부 곱한 값. 데이터 없으면 1.0. */
  combinationCoefficient: number;
  /** 3단계: 권장 최소 사용량 미만으로 배합된 원료가 있으면 1.0 미만으로 감쇠. 데이터 없으면 1.0. */
  concentrationFactor: number;
  /** 4단계: 처방 실측 안정성 기록이 있으면 반영. 없으면 1.0. */
  stabilityFactor: number;
  /** 위 네 값을 전부 곱하고 0~100으로 clamp한 최종 효능값. */
  finalValue: number;
}

/** 역할별 효능값과 비중값. 05번 "효능값(절대 강도)과 비중값(상대 비율)은 다른 값" 원칙 그대로. */
export interface RatioResult {
  domainCode: string;
  efficacy: number;
  ratioPercent: number;
}
