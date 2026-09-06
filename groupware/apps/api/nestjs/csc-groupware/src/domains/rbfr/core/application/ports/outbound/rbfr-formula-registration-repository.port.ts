import type { CreateFormulaInput, CreateFormulaResult } from '../../../domain/types';

/** 처방 생성(쓰기) Outbound Port. 계산·검증용 조회는 RbfrFormulaRepositoryPort가 담당한다. */
export interface RbfrFormulaRegistrationRepositoryPort {
  /** rbfr_projects + rbfr_formulas + rbfr_formula_ingredients를 한 번에 만든다(원자적으로). */
  createFormula(input: CreateFormulaInput): Promise<CreateFormulaResult>;
}

export const RBFR_FORMULA_REGISTRATION_REPOSITORY_PORT = Symbol(
  'RBFR_FORMULA_REGISTRATION_REPOSITORY_PORT',
);
