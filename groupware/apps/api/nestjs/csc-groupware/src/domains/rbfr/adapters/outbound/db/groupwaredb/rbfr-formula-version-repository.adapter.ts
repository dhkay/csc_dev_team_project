/** RbfrFormulaVersionRepositoryPort의 Drizzle 구현. groupwaredb를 직접 사용한다. */
import { Injectable } from '@nestjs/common';
import { desc, eq, inArray, and } from 'drizzle-orm';
import {
  groupwareDb,
  rbfrFormulaIngredients,
  rbfrFormulaRatios,
  rbfrFormulaConditions,
  rbfrIngredients,
  rbfrIngredientPrices,
  rbfrCellRuleLimits,
  rbfrCellMapping,
  rbfrFormulaVersions,
  rbfrVersionRecipe,
  rbfrVersionRatios,
} from '@csc/database/groupwaredb';
import type {
  CellMappingEntry,
  CreateFormulaVersionInput,
  FormulaTargetRatio,
  FormulaVersionSummary,
  VersionRecipeSourceLine,
} from '../../../../core/domain/types';
import type { RbfrFormulaVersionRepositoryPort } from '../../../../core/application/ports/outbound';

const DEFAULT_BATCH_SIZE = 100;

@Injectable()
export class RbfrFormulaVersionRepositoryAdapter implements RbfrFormulaVersionRepositoryPort {
  async findFormulaIngredientLines(formulaId: number): Promise<VersionRecipeSourceLine[]> {
    const lines = await groupwareDb
      .select({
        ingredientId: rbfrFormulaIngredients.ingredientId,
        phase: rbfrFormulaIngredients.phase,
        actualPct: rbfrFormulaIngredients.actualPct,
        inciName: rbfrIngredients.inciName,
        nameKo: rbfrIngredients.nameKo,
      })
      .from(rbfrFormulaIngredients)
      .innerJoin(rbfrIngredients, eq(rbfrIngredients.id, rbfrFormulaIngredients.ingredientId))
      .where(eq(rbfrFormulaIngredients.formulaId, formulaId));

    const ingredientIds = lines.map((l) => l.ingredientId);
    const latestPriceByIngredient = await this.findLatestUnitPrices(ingredientIds);

    return lines.map((l) => ({
      ingredientId: l.ingredientId,
      inciName: l.inciName,
      nameKo: l.nameKo ?? undefined,
      phase: l.phase ?? undefined,
      pct: l.actualPct !== null ? Number(l.actualPct) : 0,
      unitPrice: latestPriceByIngredient.get(l.ingredientId),
    }));
  }

  /** 원료마다 base_date가 가장 최근인 단가 1건. 한 쿼리로 전부 받아 JS에서 첫 등장분만 취한다. */
  private async findLatestUnitPrices(ingredientIds: number[]): Promise<Map<number, number>> {
    if (ingredientIds.length === 0) return new Map();
    const rows = await groupwareDb
      .select({ ingredientId: rbfrIngredientPrices.ingredientId, unitPrice: rbfrIngredientPrices.unitPrice })
      .from(rbfrIngredientPrices)
      .where(inArray(rbfrIngredientPrices.ingredientId, ingredientIds))
      .orderBy(desc(rbfrIngredientPrices.baseDate));

    const result = new Map<number, number>();
    for (const row of rows) {
      if (!result.has(row.ingredientId)) result.set(row.ingredientId, Number(row.unitPrice));
    }
    return result;
  }

  async findFormulaTargetRatios(formulaId: number): Promise<FormulaTargetRatio[]> {
    const rows = await groupwareDb
      .select({
        domainCode: rbfrFormulaRatios.domainCode,
        targetRatio: rbfrFormulaRatios.targetRatio,
        isMain: rbfrFormulaRatios.isMain,
      })
      .from(rbfrFormulaRatios)
      .where(eq(rbfrFormulaRatios.formulaId, formulaId));
    return rows.map((r) => ({ domainCode: r.domainCode, targetRatio: Number(r.targetRatio), isMain: r.isMain }));
  }

  async findBatchSize(formulaId: number): Promise<number> {
    const [row] = await groupwareDb
      .select({ batchSize: rbfrFormulaConditions.batchSize })
      .from(rbfrFormulaConditions)
      .where(eq(rbfrFormulaConditions.formulaId, formulaId));
    return row ? Number(row.batchSize) : DEFAULT_BATCH_SIZE;
  }

  async findApprovedCellRule(
    profileCode: string,
  ): Promise<{ ruleVersion: string; mapping: CellMappingEntry[] } | undefined> {
    const [rule] = await groupwareDb
      .select({ ruleVersion: rbfrCellRuleLimits.ruleVersion })
      .from(rbfrCellRuleLimits)
      .where(and(eq(rbfrCellRuleLimits.profileCode, profileCode), eq(rbfrCellRuleLimits.isApproved, true)))
      .orderBy(desc(rbfrCellRuleLimits.approvedAt))
      .limit(1);
    if (!rule) return undefined;

    const mappingRows = await groupwareDb
      .select()
      .from(rbfrCellMapping)
      .where(eq(rbfrCellMapping.ruleVersion, rule.ruleVersion))
      .orderBy(rbfrCellMapping.ratioFrom);

    return {
      ruleVersion: rule.ruleVersion,
      mapping: mappingRows.map((m) => ({
        ratioFrom: Number(m.ratioFrom),
        ratioTo: Number(m.ratioTo),
        cellCount: m.cellCount,
      })),
    };
  }

  async nextVersionNo(formulaId: number): Promise<number> {
    const rows = await groupwareDb
      .select({ versionNo: rbfrFormulaVersions.versionNo })
      .from(rbfrFormulaVersions)
      .where(eq(rbfrFormulaVersions.formulaId, formulaId));
    const maxVersionNo = rows.reduce((max, r) => Math.max(max, r.versionNo), 0);
    return maxVersionNo + 1;
  }

  async createVersionSnapshot(input: CreateFormulaVersionInput): Promise<FormulaVersionSummary> {
    return await groupwareDb.transaction(async (tx) => {
      const [versionRow] = await tx
        .insert(rbfrFormulaVersions)
        .values({
          formulaId: input.formulaId,
          versionNo: input.versionNo,
          fixedAt: new Date(),
          fixedBy: input.fixedBy,
          appVersion: input.appVersion,
          ruleVersion: input.ruleVersion,
          batchSize: input.batchSize.toString(),
          totalCells: input.totalCells,
          totalCost: input.totalCost.toString(),
          snapshotJson: input.snapshotJson,
        })
        .returning();

      if (input.recipeLines.length > 0) {
        await tx.insert(rbfrVersionRecipe).values(
          input.recipeLines.map((line, i) => ({
            versionId: versionRow.id,
            lineNo: i + 1,
            ingredientId: line.ingredientId,
            inciName: line.inciName,
            nameKo: line.nameKo,
            phase: line.phase,
            pct: line.pct.toString(),
            grams: line.grams.toString(),
            unitPrice: line.unitPrice?.toString(),
          })),
        );
      }

      if (input.ratioLines.length > 0) {
        await tx.insert(rbfrVersionRatios).values(
          input.ratioLines.map((line) => ({
            versionId: versionRow.id,
            domainCode: line.domainCode,
            targetRatio: line.targetRatio.toString(),
            resultRatio: line.resultRatio.toString(),
            cellCount: line.cellCount,
            isMain: line.isMain,
          })),
        );
      }

      return toVersionSummary(versionRow);
    });
  }

  async listVersions(formulaId: number): Promise<FormulaVersionSummary[]> {
    const rows = await groupwareDb
      .select()
      .from(rbfrFormulaVersions)
      .where(eq(rbfrFormulaVersions.formulaId, formulaId))
      .orderBy(desc(rbfrFormulaVersions.versionNo));
    return rows.map(toVersionSummary);
  }
}

function toVersionSummary(row: typeof rbfrFormulaVersions.$inferSelect): FormulaVersionSummary {
  return {
    id: row.id,
    formulaId: row.formulaId,
    versionNo: row.versionNo,
    fixedAt: row.fixedAt.toISOString(),
    fixedBy: row.fixedBy,
    appVersion: row.appVersion,
    ruleVersion: row.ruleVersion ?? undefined,
    batchSize: Number(row.batchSize),
    totalCells: row.totalCells ?? undefined,
    totalCost: row.totalCost !== null ? Number(row.totalCost) : undefined,
  };
}
