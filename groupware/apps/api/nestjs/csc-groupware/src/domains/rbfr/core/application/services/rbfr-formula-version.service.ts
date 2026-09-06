/**
 * 처방 확정(버전 스냅샷 생성) — 05_스코어링엔진.md 원칙7 "확정 후 불변"의 실제 구현.
 * 실제 산출값(resultRatio)은 이미 검증된 RbfrFormulaCalculationService를 재사용해 얻는다
 * (원가 계산도 마찬가지 — 여기서 새로 계산하지 않는다). Cell 변환만 이 서비스가 직접 한다.
 *
 * appVersion은 아직 그룹웨어에 실제 앱 버전 체계가 없어 잠정 상수로 둔다(확인 필요).
 */
import { Inject, Injectable } from '@nestjs/common';
import type { CellMappingEntry, FormulaVersionSummary } from '../../domain/types';
import { RBFR_FORMULA_CALCULATION_PORT, type RbfrFormulaCalculationPort, type RbfrFormulaVersionPort } from '../ports/inbound';
import { RBFR_FORMULA_VERSION_REPOSITORY_PORT, type RbfrFormulaVersionRepositoryPort } from '../ports/outbound';

/** 그룹웨어에 실제 앱 버전 체계가 생기기 전까지의 잠정값(확인 필요). */
const APP_VERSION = '0.1.0-draft';

/** 비중(%)이 속하는 구간의 Cell 수. 구간은 "이상~미만"(03번 문서). 해당 구간이 없으면 0. */
export function cellCountFor(ratioPercent: number, mapping: CellMappingEntry[]): number {
  const bucket = mapping.find((m) => ratioPercent >= m.ratioFrom && ratioPercent < m.ratioTo);
  return bucket?.cellCount ?? 0;
}

@Injectable()
export class RbfrFormulaVersionService implements RbfrFormulaVersionPort {
  constructor(
    @Inject(RBFR_FORMULA_VERSION_REPOSITORY_PORT)
    private readonly versionRepository: RbfrFormulaVersionRepositoryPort,
    @Inject(RBFR_FORMULA_CALCULATION_PORT)
    private readonly calculation: RbfrFormulaCalculationPort,
  ) {}

  async confirmFormula(formulaId: number, profileCode: string, fixedBy: number): Promise<FormulaVersionSummary> {
    const cellRule = await this.versionRepository.findApprovedCellRule(profileCode);
    if (!cellRule) {
      throw new Error(`Profile ${profileCode}에 승인된 Cell 규칙 판이 없어 확정할 수 없습니다.`);
    }

    const [calc, recipeSourceLines, targetRatios, batchSize, versionNo] = await Promise.all([
      this.calculation.calculateAndValidateFormula(formulaId, profileCode),
      this.versionRepository.findFormulaIngredientLines(formulaId),
      this.versionRepository.findFormulaTargetRatios(formulaId),
      this.versionRepository.findBatchSize(formulaId),
      this.versionRepository.nextVersionNo(formulaId),
    ]);

    const ratioLines = targetRatios.map((target) => {
      const resultRatio = calc.ratios.find((r) => r.domainCode === target.domainCode)?.ratioPercent ?? 0;
      return {
        domainCode: target.domainCode,
        targetRatio: target.targetRatio,
        isMain: target.isMain,
        resultRatio,
        cellCount: cellCountFor(resultRatio, cellRule.mapping),
      };
    });
    const totalCells = ratioLines.reduce((sum, r) => sum + r.cellCount, 0);
    const recipeLines = recipeSourceLines.map((line) => ({ ...line, grams: (line.pct / 100) * batchSize }));

    const snapshotJson = JSON.stringify({
      directResults: calc.directResults,
      ratios: calc.ratios,
      validation: calc.validation,
      recipeLines,
      batchSize,
    });

    return await this.versionRepository.createVersionSnapshot({
      formulaId,
      versionNo,
      fixedBy,
      appVersion: APP_VERSION,
      ruleVersion: cellRule.ruleVersion,
      batchSize,
      totalCells,
      totalCost: calc.validation.cost,
      snapshotJson,
      recipeLines,
      ratioLines,
    });
  }

  async listVersions(formulaId: number): Promise<FormulaVersionSummary[]> {
    return await this.versionRepository.listVersions(formulaId);
  }
}
