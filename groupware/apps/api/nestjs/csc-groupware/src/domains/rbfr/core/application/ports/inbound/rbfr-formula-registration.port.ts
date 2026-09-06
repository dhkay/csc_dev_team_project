import type { CreateFormulaInput, CreateFormulaResult } from '../../../domain/types';

/** 02_화면구성.md 탭1 "정방향 계산" 화면의 입력부(원료 선택 + 배합비)가 호출하는 진입점. */
export interface RbfrFormulaRegistrationPort {
  createFormula(input: CreateFormulaInput): Promise<CreateFormulaResult>;
}

export const RBFR_FORMULA_REGISTRATION_PORT = Symbol('RBFR_FORMULA_REGISTRATION_PORT');
