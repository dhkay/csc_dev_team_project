import type { FormulaVersionSummary } from '../../../domain/types';

/** 처방 확정(버전 스냅샷 생성)이 호출하는 진입점. 검수 승인(APPROVED) 시 RbfrFormulaReviewService가 내부적으로 호출한다. */
export interface RbfrFormulaVersionPort {
  /** 그 Profile에 승인된 Cell 규칙 판이 없으면 거부한다. */
  confirmFormula(formulaId: number, profileCode: string, fixedBy: number): Promise<FormulaVersionSummary>;
  listVersions(formulaId: number): Promise<FormulaVersionSummary[]>;
}

export const RBFR_FORMULA_VERSION_PORT = Symbol('RBFR_FORMULA_VERSION_PORT');
