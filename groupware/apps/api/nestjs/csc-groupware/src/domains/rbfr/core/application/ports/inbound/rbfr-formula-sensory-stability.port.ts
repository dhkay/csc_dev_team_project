import type { FormulaSensoryStabilityInput, FormulaSensoryStabilityRecord } from '../../../domain/types';

/** 02_화면구성.md "처방 사용감·안정성 기록"(탭1 부속)이 호출하는 진입점. */
export interface RbfrFormulaSensoryStabilityPort {
  addRecord(formulaId: number, input: FormulaSensoryStabilityInput): Promise<FormulaSensoryStabilityRecord>;
  listRecords(formulaId: number): Promise<FormulaSensoryStabilityRecord[]>;
}

export const RBFR_FORMULA_SENSORY_STABILITY_PORT = Symbol('RBFR_FORMULA_SENSORY_STABILITY_PORT');
