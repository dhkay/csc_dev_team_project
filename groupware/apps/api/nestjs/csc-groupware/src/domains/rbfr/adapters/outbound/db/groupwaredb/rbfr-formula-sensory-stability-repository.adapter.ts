/** RbfrFormulaSensoryStabilityRepositoryPort의 Drizzle 구현. groupwaredb를 직접 사용한다. */
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { groupwareDb, rbfrFormulaSensoryStabilityRecords } from '@csc/database/groupwaredb';
import type { FormulaSensoryStabilityInput, FormulaSensoryStabilityRecord } from '../../../../core/domain/types';
import type { RbfrFormulaSensoryStabilityRepositoryPort } from '../../../../core/application/ports/outbound';

@Injectable()
export class RbfrFormulaSensoryStabilityRepositoryAdapter implements RbfrFormulaSensoryStabilityRepositoryPort {
  async createRecord(
    formulaId: number,
    input: FormulaSensoryStabilityInput,
  ): Promise<FormulaSensoryStabilityRecord> {
    const [row] = await groupwareDb
      .insert(rbfrFormulaSensoryStabilityRecords)
      .values({
        formulaId,
        stickinessScore: input.stickinessScore,
        freshnessScore: input.freshnessScore,
        absorptionScore: input.absorptionScore,
        spreadabilityScore: input.spreadabilityScore,
        afterfeelScore: input.afterfeelScore,
        viscosityScore: input.viscosityScore,
        separationRisk: input.separationRisk,
        precipitationRisk: input.precipitationRisk,
        colorChangeRisk: input.colorChangeRisk,
        odorChangeRisk: input.odorChangeRisk,
        phStabilityScore: input.phStabilityScore,
        heatStabilityScore: input.heatStabilityScore,
        lowTempStabilityScore: input.lowTempStabilityScore,
        overallStabilityScore: input.overallStabilityScore,
        testCondition: input.testCondition,
        dataSource: input.dataSource ?? 'unknown',
        confidenceLevel: input.confidenceLevel,
        notes: input.notes,
      })
      .returning();
    return toRecord(row);
  }

  async listRecords(formulaId: number): Promise<FormulaSensoryStabilityRecord[]> {
    const rows = await groupwareDb
      .select()
      .from(rbfrFormulaSensoryStabilityRecords)
      .where(eq(rbfrFormulaSensoryStabilityRecords.formulaId, formulaId))
      .orderBy(rbfrFormulaSensoryStabilityRecords.createdAt);
    return rows.map(toRecord);
  }
}

function toRecord(
  row: typeof rbfrFormulaSensoryStabilityRecords.$inferSelect,
): FormulaSensoryStabilityRecord {
  return {
    id: row.id,
    formulaId: row.formulaId,
    stickinessScore: row.stickinessScore ?? undefined,
    freshnessScore: row.freshnessScore ?? undefined,
    absorptionScore: row.absorptionScore ?? undefined,
    spreadabilityScore: row.spreadabilityScore ?? undefined,
    afterfeelScore: row.afterfeelScore ?? undefined,
    viscosityScore: row.viscosityScore ?? undefined,
    separationRisk: row.separationRisk ?? undefined,
    precipitationRisk: row.precipitationRisk ?? undefined,
    colorChangeRisk: row.colorChangeRisk ?? undefined,
    odorChangeRisk: row.odorChangeRisk ?? undefined,
    phStabilityScore: row.phStabilityScore ?? undefined,
    heatStabilityScore: row.heatStabilityScore ?? undefined,
    lowTempStabilityScore: row.lowTempStabilityScore ?? undefined,
    overallStabilityScore: row.overallStabilityScore ?? undefined,
    testCondition: row.testCondition ?? undefined,
    dataSource: row.dataSource,
    confidenceLevel: row.confidenceLevel ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}
