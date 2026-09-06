import type {
  ConcentrationLimit,
  FormulaConditions,
  FormulaIngredientInput,
  IngredientCertEligibility,
  IngredientHlbProfile,
  IngredientIncompatEntry,
  IngredientNoaddFlag,
  IngredientPhRange,
  IngredientRegulationEntry,
  IngredientRoleContribution,
  IngredientUnitPrice,
  IntegratedRoleInput,
  InteractionCoefficient,
  PinnedIngredient,
} from '../../../domain/types';

/**
 * RBFR 처방 계산·검증에 필요한 원료/처방 데이터 조회 Outbound Port. 계산·검증 로직
 * (RbfrScoringService/RbfrValidationService)은 이 Port를 모르고, RbfrFormulaCalculationService가
 * 이 Port로 데이터를 모아 계산·검증 서비스에 넘긴다.
 *
 * 메서드 이름에 Record 접미사를 붙이지 않는다 — 단일 테이블 행 CRUD가 아니라 계산 입력 모양에
 * 맞춰 조회/가공한 값이기 때문(api-architecture.md §4 "Record 접미사 적용 범위" 참고).
 */
export interface RbfrFormulaRepositoryPort {
  findFormulaIngredients(formulaId: number): Promise<FormulaIngredientInput[]>;
  findPinnedIngredients(formulaId: number): Promise<PinnedIngredient[]>;
  findFormulaConditions(formulaId: number): Promise<FormulaConditions>;
  findFormulaCountryCodes(formulaId: number): Promise<string[]>;

  findDirectDomainCodes(profileCode: string): Promise<string[]>;
  findIntegratedDomainCode(profileCode: string): Promise<string | null>;
  /** rbfr_formula_ratios에서 통합역할(균형) 행을 찾는다. 근거(evidence) 유무로 hasEvidence를 정한다(05번 원칙5). */
  findIntegratedRoleInput(formulaId: number, integratedDomainCode: string): Promise<IntegratedRoleInput>;

  findContributions(ingredientIds: number[], domainCodes: string[]): Promise<IngredientRoleContribution[]>;
  findInteractionCoefficients(ingredientIds: number[], domainCodes: string[]): Promise<InteractionCoefficient[]>;
  findConcentrationLimits(ingredientIds: number[]): Promise<ConcentrationLimit[]>;

  findRegulations(ingredientIds: number[]): Promise<IngredientRegulationEntry[]>;
  findIncompat(ingredientIds: number[]): Promise<IngredientIncompatEntry[]>;
  findNoaddFlags(ingredientIds: number[]): Promise<IngredientNoaddFlag[]>;
  findCerts(ingredientIds: number[]): Promise<IngredientCertEligibility[]>;
  findPhRanges(ingredientIds: number[]): Promise<IngredientPhRange[]>;
  findHlbProfiles(ingredientIds: number[]): Promise<IngredientHlbProfile[]>;
  findUnitPrices(ingredientIds: number[]): Promise<IngredientUnitPrice[]>;
}

export const RBFR_FORMULA_REPOSITORY_PORT = Symbol('RBFR_FORMULA_REPOSITORY_PORT');
