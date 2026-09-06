import type { DirectRoleEfficacyResult, RatioResult } from '../../../domain/types';
import type { FormulaValidationResult } from './rbfr-validation.port';

export interface FormulaCalculationResult {
  directResults: DirectRoleEfficacyResult[];
  ratios: RatioResult[];
  validation: FormulaValidationResult;
}

/**
 * 처방 하나를 계산하고 검증까지 마친 전체 결과를 돌려주는 Inbound Port. 02_화면구성.md 탭1
 * "정방향 계산" 화면이 궁극적으로 호출하게 될 진입점이다(Controller는 6단계에서 추가).
 */
export interface RbfrFormulaCalculationPort {
  calculateAndValidateFormula(formulaId: number, profileCode: string): Promise<FormulaCalculationResult>;
}

export const RBFR_FORMULA_CALCULATION_PORT = Symbol('RBFR_FORMULA_CALCULATION_PORT');
