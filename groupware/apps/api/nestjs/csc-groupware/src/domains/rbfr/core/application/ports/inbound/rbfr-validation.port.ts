import type {
  FormulaConditions,
  FormulaIngredientInput,
  IngredientCertEligibility,
  IngredientHlbProfile,
  IngredientIncompatEntry,
  IngredientNoaddFlag,
  IngredientPhRange,
  IngredientRegulationEntry,
  IngredientUnitPrice,
  PinnedIngredient,
  ValidationIssue,
} from '../../../domain/types';

/** HLB 판정 결과. */
export interface HlbResult {
  status: 'ok' | 'unstable' | 'unknown';
  requiredHlb?: number;
  mixedHlb?: number;
  message: string;
}

/** 처방 전체 검증 결과. canConfirm=false면 이 처방은 FIXED로 전환할 수 없다. */
export interface FormulaValidationResult {
  issues: ValidationIssue[];
  canConfirm: boolean;
  hlb: HlbResult;
  cost: number;
}

export interface ValidateFormulaInput {
  formulaIngredients: FormulaIngredientInput[];
  regulations: IngredientRegulationEntry[];
  targetCountryCodes: string[];
  noaddFlags: IngredientNoaddFlag[];
  certs: IngredientCertEligibility[];
  pinned: PinnedIngredient[];
  phRanges: IngredientPhRange[];
  incompat: IngredientIncompatEntry[];
  hlbProfiles: IngredientHlbProfile[];
  unitPrices: IngredientUnitPrice[];
  conditions: FormulaConditions;
}

/** RBFR 처방 검증 Inbound Port. 05_스코어링엔진.md "처방 검증 로직"(9단계) 참고. */
export interface RbfrValidationPort {
  validateFormula(input: ValidateFormulaInput): FormulaValidationResult;
}

export const RBFR_VALIDATION_PORT = Symbol('RBFR_VALIDATION_PORT');
