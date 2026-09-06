/**
 * RBFR 처방 검증 — 순수 도메인 타입. scoringEngine과 마찬가지로 프레임워크/ORM을 모른다.
 * 필드명은 03_DB스키마.md의 rbfr_* 테이블과 대응한다(주석에 표기).
 */

import type { FormulaIngredientInput } from './types.ts';

export type { FormulaIngredientInput };

/** rbfr_ingredient_regulations 한 행. 국가별 규제 판정. */
export interface IngredientRegulationEntry {
  ingredientId: string;
  countryCode: string;
  regType: 'ALLOW' | 'BAN' | 'LIMIT' | 'COND' | 'NODATA';
  /** LIMIT일 때만 의미 있는 허용 한도(%). */
  limitPercent?: number;
  /** CONFIRMED만 판정에 쓴다(원칙4/9번 문서 "PROPOSED는 표시만, 산출·검증에 미사용"). */
  status: 'CONFIRMED' | 'PROPOSED' | 'REJECTED';
}

/** rbfr_ingredient_incompat 한 행. 양방향 조회를 전제로 한 방향 그대로 받는다. */
export interface IngredientIncompatEntry {
  ingredientAId: string;
  ingredientBId: string;
  severity: 'BLOCK' | 'WARN';
  reason?: string;
}

/** rbfr_ingredients의 pH 안정 범위. */
export interface IngredientPhRange {
  ingredientId: string;
  phMin?: number;
  phMax?: number;
}

/** rbfr_ingredient_flags 한 행(무첨가 분류). */
export interface IngredientNoaddFlag {
  ingredientId: string;
  noaddCode: string;
}

/** rbfr_ingredient_certs 한 행. is_eligible=false면 그 인증 요건을 못 채운다. */
export interface IngredientCertEligibility {
  ingredientId: string;
  certCode: string;
  isEligible: boolean;
}

/** rbfr_formula_ingredients의 고정 배합량 지정. */
export interface PinnedIngredient {
  ingredientId: string;
  isPinned: boolean;
  pinnedPercent?: number;
}

/** rbfr_formula_conditions/rbfr_formula_condition_codes에서 온 처방 조건. */
export interface FormulaConditions {
  targetPhMin?: number;
  targetPhMax?: number;
  /** 이 처방이 배제하기로 선택한 무첨가 분류 코드 목록. */
  excludedNoaddCodes: string[];
  /** 이 처방이 만족해야 하는 인증 코드 목록(예: 비건 인증을 표방하는 처방). */
  requiredCertCodes: string[];
}

/** HLB 계산용 원료 물성(rbfr_ingredients.hlb/emulsion_role). 유상부가 아니면 hlb는 없어도 된다. */
export interface IngredientHlbProfile {
  ingredientId: string;
  /** 유상(oil)/수상(water)/기타. HLB 계산은 유상부 원료만 대상으로 한다. */
  phaseType?: 'oil' | 'water' | 'other';
  hlb?: number;
  /** 유화제인 경우만: 실제 배합에서 유화를 담당하는지. */
  emulsionRole?: 'emulsifier' | 'none';
}

/** rbfr_ingredient_prices 최신 단가(원/g). */
export interface IngredientUnitPrice {
  ingredientId: string;
  pricePerGram: number;
}

export type ValidationSeverity = 'ok' | 'warn' | 'block';

/** 검증 항목 하나의 결과. severity='block'이면 이 처방은 확정할 수 없다. */
export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
}
