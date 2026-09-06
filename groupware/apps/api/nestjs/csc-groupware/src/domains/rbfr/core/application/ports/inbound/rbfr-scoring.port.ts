import type {
  ConcentrationLimit,
  DirectRoleEfficacyResult,
  FormulaIngredientInput,
  IngredientRoleContribution,
  IntegratedRoleInput,
  InteractionCoefficient,
  RatioResult,
} from '../../../domain/types';

/** RBFR 직접역할 효능값/비중값 계산 Inbound Port. 05_스코어링엔진.md 계산식 참고. */
export interface RbfrScoringPort {
  calculateDirectRoleEfficacy(
    domainCode: string,
    formulaIngredients: FormulaIngredientInput[],
    contributions: IngredientRoleContribution[],
    interactions: InteractionCoefficient[],
    concentrationLimits: ConcentrationLimit[],
    stabilityFactor?: number,
  ): DirectRoleEfficacyResult;

  calculateAllDirectRoleEfficacies(
    directDomainCodes: string[],
    formulaIngredients: FormulaIngredientInput[],
    contributions: IngredientRoleContribution[],
    interactions: InteractionCoefficient[],
    concentrationLimits: ConcentrationLimit[],
    stabilityFactorByDomain?: Record<string, number>,
  ): DirectRoleEfficacyResult[];

  calculateRatioValues(
    directResults: DirectRoleEfficacyResult[],
    integratedRole?: IntegratedRoleInput,
  ): RatioResult[];
}

export const RBFR_SCORING_PORT = Symbol('RBFR_SCORING_PORT');
