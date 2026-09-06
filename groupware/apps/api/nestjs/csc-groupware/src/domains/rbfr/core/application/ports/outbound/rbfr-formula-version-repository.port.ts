import type {
  CellMappingEntry,
  CreateFormulaVersionInput,
  FormulaTargetRatio,
  FormulaVersionSummary,
  VersionRecipeSourceLine,
} from '../../../domain/types';

/** 처방 확정(버전 스냅샷) 생성에 필요한 조회/쓰기 Outbound Port. */
export interface RbfrFormulaVersionRepositoryPort {
  findFormulaIngredientLines(formulaId: number): Promise<VersionRecipeSourceLine[]>;
  findFormulaTargetRatios(formulaId: number): Promise<FormulaTargetRatio[]>;
  /** rbfr_formula_conditions.batch_size. 조건 행이 없으면 기본값(100)을 돌려준다. */
  findBatchSize(formulaId: number): Promise<number>;
  /** 그 Profile에서 가장 최근에 승인된 Cell 규칙 판과 변환표. 승인된 판이 없으면 undefined. */
  findApprovedCellRule(profileCode: string): Promise<{ ruleVersion: string; mapping: CellMappingEntry[] } | undefined>;
  nextVersionNo(formulaId: number): Promise<number>;
  /** rbfr_formula_versions + rbfr_version_recipe + rbfr_version_ratios를 한 트랜잭션으로 만든다. */
  createVersionSnapshot(input: CreateFormulaVersionInput): Promise<FormulaVersionSummary>;
  listVersions(formulaId: number): Promise<FormulaVersionSummary[]>;
}

export const RBFR_FORMULA_VERSION_REPOSITORY_PORT = Symbol('RBFR_FORMULA_VERSION_REPOSITORY_PORT');
