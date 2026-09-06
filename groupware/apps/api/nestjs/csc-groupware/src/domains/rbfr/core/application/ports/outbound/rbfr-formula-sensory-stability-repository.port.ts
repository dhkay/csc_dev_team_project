import type { FormulaSensoryStabilityInput, FormulaSensoryStabilityRecord } from '../../../domain/types';

/** 처방 사용감·안정성 기록(탭1 부속) Outbound Port. */
export interface RbfrFormulaSensoryStabilityRepositoryPort {
  createRecord(formulaId: number, input: FormulaSensoryStabilityInput): Promise<FormulaSensoryStabilityRecord>;
  listRecords(formulaId: number): Promise<FormulaSensoryStabilityRecord[]>;
}

export const RBFR_FORMULA_SENSORY_STABILITY_REPOSITORY_PORT = Symbol(
  'RBFR_FORMULA_SENSORY_STABILITY_REPOSITORY_PORT',
);
