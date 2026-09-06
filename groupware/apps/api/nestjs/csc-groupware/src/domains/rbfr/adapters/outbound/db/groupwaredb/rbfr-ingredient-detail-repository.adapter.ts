/** RbfrIngredientDetailRepositoryPort의 Drizzle 구현. groupwaredb를 직접 사용한다. */
import { Injectable } from '@nestjs/common';
import { eq, or } from 'drizzle-orm';
import {
  groupwareDb,
  rbfrIngredientCas,
  rbfrIngredientCerts,
  rbfrIngredientFlags,
  rbfrIngredientRegulations,
  rbfrIngredientInteractions,
  rbfrIngredientIncompat,
} from '@csc/database/groupwaredb';
import type {
  IngredientCasEntry,
  IngredientCasInput,
  IngredientCertEntry,
  IngredientCertInput,
  IngredientFlagEntry,
  IngredientFlagInput,
  IngredientIncompatRecord,
  IngredientIncompatInput,
  IngredientInteractionEntry,
  IngredientInteractionInput,
  IngredientRegulationRecord,
  IngredientRegulationInput,
} from '../../../../core/domain/types';
import type { RbfrIngredientDetailRepositoryPort } from '../../../../core/application/ports/outbound';

/** numeric 컬럼은 drizzle이 문자열로 다룬다 — undefined는 그대로, 값이 있으면 문자열로 변환. */
function numericOrUndefined(value: number | undefined): string | undefined {
  return value === undefined ? undefined : value.toString();
}

@Injectable()
export class RbfrIngredientDetailRepositoryAdapter implements RbfrIngredientDetailRepositoryPort {
  async createCas(ingredientId: number, input: IngredientCasInput): Promise<void> {
    await groupwareDb.insert(rbfrIngredientCas).values({ ingredientId, casNo: input.casNo, note: input.note });
  }

  async listCas(ingredientId: number): Promise<IngredientCasEntry[]> {
    const rows = await groupwareDb
      .select()
      .from(rbfrIngredientCas)
      .where(eq(rbfrIngredientCas.ingredientId, ingredientId));
    return rows.map((r) => ({ ingredientId: r.ingredientId, casNo: r.casNo, note: r.note ?? undefined }));
  }

  async createRegulation(
    ingredientId: number,
    input: IngredientRegulationInput,
    status: 'CONFIRMED' | 'PROPOSED' | 'REJECTED',
  ): Promise<IngredientRegulationRecord> {
    const [row] = await groupwareDb
      .insert(rbfrIngredientRegulations)
      .values({
        ingredientId,
        countryCode: input.countryCode,
        regType: input.regType,
        status,
        limitPct: numericOrUndefined(input.limitPct),
        conditionTxt: input.conditionTxt,
        source: input.source,
        sourceUrl: input.sourceUrl,
        note: input.note,
      })
      .returning();
    return toRegulationEntry(row);
  }

  async listRegulations(ingredientId: number): Promise<IngredientRegulationRecord[]> {
    const rows = await groupwareDb
      .select()
      .from(rbfrIngredientRegulations)
      .where(eq(rbfrIngredientRegulations.ingredientId, ingredientId));
    return rows.map(toRegulationEntry);
  }

  async createCert(ingredientId: number, input: IngredientCertInput): Promise<void> {
    await groupwareDb.insert(rbfrIngredientCerts).values({
      ingredientId,
      certCode: input.certCode,
      isEligible: input.isEligible,
      issuer: input.issuer,
      certNo: input.certNo,
      docUrl: input.docUrl,
      validUntil: input.validUntil,
      note: input.note,
    });
  }

  async listCerts(ingredientId: number): Promise<IngredientCertEntry[]> {
    const rows = await groupwareDb
      .select()
      .from(rbfrIngredientCerts)
      .where(eq(rbfrIngredientCerts.ingredientId, ingredientId));
    return rows.map((r) => ({
      ingredientId: r.ingredientId,
      certCode: r.certCode,
      isEligible: r.isEligible,
      issuer: r.issuer ?? undefined,
      certNo: r.certNo ?? undefined,
      docUrl: r.docUrl ?? undefined,
      validUntil: r.validUntil ?? undefined,
      checkedAt: r.checkedAt ?? undefined,
      note: r.note ?? undefined,
    }));
  }

  async createFlag(ingredientId: number, input: IngredientFlagInput): Promise<void> {
    await groupwareDb.insert(rbfrIngredientFlags).values({ ingredientId, noaddCode: input.noaddCode });
  }

  async listFlags(ingredientId: number): Promise<IngredientFlagEntry[]> {
    const rows = await groupwareDb
      .select()
      .from(rbfrIngredientFlags)
      .where(eq(rbfrIngredientFlags.ingredientId, ingredientId));
    return rows.map((r) => ({ ingredientId: r.ingredientId, noaddCode: r.noaddCode }));
  }

  async createInteraction(input: IngredientInteractionInput): Promise<IngredientInteractionEntry> {
    const [row] = await groupwareDb
      .insert(rbfrIngredientInteractions)
      .values({
        ingredientAId: input.ingredientAId,
        ingredientBId: input.ingredientBId,
        domainCode: input.domainCode,
        interactionType: input.interactionType,
        coefficient: numericOrUndefined(input.coefficient),
        confidenceLevel: input.confidenceLevel,
        dataSource: input.dataSource,
        notes: input.notes,
      })
      .returning();
    return toInteractionEntry(row);
  }

  async listInteractions(ingredientId: number): Promise<IngredientInteractionEntry[]> {
    const rows = await groupwareDb
      .select()
      .from(rbfrIngredientInteractions)
      .where(
        or(
          eq(rbfrIngredientInteractions.ingredientAId, ingredientId),
          eq(rbfrIngredientInteractions.ingredientBId, ingredientId),
        ),
      );
    return rows.map(toInteractionEntry);
  }

  async createIncompat(input: IngredientIncompatInput): Promise<void> {
    await groupwareDb.insert(rbfrIngredientIncompat).values({
      ingredientId: input.ingredientId,
      otherId: input.otherId,
      severity: input.severity,
      reason: input.reason,
    });
  }

  async listIncompat(ingredientId: number): Promise<IngredientIncompatRecord[]> {
    const rows = await groupwareDb
      .select()
      .from(rbfrIngredientIncompat)
      .where(
        or(eq(rbfrIngredientIncompat.ingredientId, ingredientId), eq(rbfrIngredientIncompat.otherId, ingredientId)),
      );
    // 조회 기준 ingredientId 관점으로 정규화한다(양방향 검색, 03번 문서).
    return rows.map((r) => ({
      ingredientId,
      otherId: r.ingredientId === ingredientId ? r.otherId : r.ingredientId,
      severity: r.severity,
      reason: r.reason ?? undefined,
    }));
  }
}

function toRegulationEntry(row: typeof rbfrIngredientRegulations.$inferSelect): IngredientRegulationRecord {
  return {
    regId: row.regId,
    ingredientId: row.ingredientId,
    countryCode: row.countryCode,
    regType: row.regType,
    status: row.status,
    limitPct: row.limitPct !== null ? Number(row.limitPct) : undefined,
    conditionTxt: row.conditionTxt ?? undefined,
    source: row.source ?? undefined,
    sourceUrl: row.sourceUrl ?? undefined,
    checkedAt: row.checkedAt ?? undefined,
    note: row.note ?? undefined,
  };
}

function toInteractionEntry(row: typeof rbfrIngredientInteractions.$inferSelect): IngredientInteractionEntry {
  return {
    id: row.id,
    ingredientAId: row.ingredientAId,
    ingredientBId: row.ingredientBId,
    domainCode: row.domainCode,
    interactionType: row.interactionType,
    coefficient: Number(row.coefficient),
    confidenceLevel: row.confidenceLevel ?? undefined,
    dataSource: row.dataSource,
    notes: row.notes ?? undefined,
  };
}
