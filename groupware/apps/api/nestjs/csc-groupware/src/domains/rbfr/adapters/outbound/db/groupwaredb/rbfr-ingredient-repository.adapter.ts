/** RbfrIngredientRepositoryPort의 Drizzle 구현. groupwaredb를 직접 사용한다. */
import { Injectable } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  groupwareDb,
  rbfrIngredients,
  rbfrIngredientRoles,
  rbfrIngredientDictionary,
  rbfrIngredientRegulations,
} from '@csc/database/groupwaredb';
import type {
  CreateIngredientInput,
  IngredientRecommendationCandidate,
  IngredientSummary,
  MfdsIngredientRecord,
} from '../../../../core/domain/types';
import type { RbfrIngredientRepositoryPort } from '../../../../core/application/ports/outbound';

/** numeric 컬럼은 drizzle이 문자열로 다룬다 — undefined는 그대로, 값이 있으면 문자열로 변환. */
function numericOrUndefined(value: number | undefined): string | undefined {
  return value === undefined ? undefined : value.toString();
}

@Injectable()
export class RbfrIngredientRepositoryAdapter implements RbfrIngredientRepositoryPort {
  async createIngredient(input: CreateIngredientInput): Promise<number> {
    const [row] = await groupwareDb
      .insert(rbfrIngredients)
      .values({
        inciName: input.inciName,
        nameKo: input.nameKo,
        category: input.category,
        concMin: numericOrUndefined(input.concMin),
        concMax: numericOrUndefined(input.concMax),
        phMin: numericOrUndefined(input.phMin),
        phMax: numericOrUndefined(input.phMax),
        hlb: numericOrUndefined(input.hlb),
        emulsionRole: input.emulsionRole,
        solubility: input.solubility,
        isBase: input.isBase ?? false,
        createdBy: input.createdBy,
      })
      .returning({ id: rbfrIngredients.id });

    if (input.contributions.length > 0) {
      await groupwareDb.insert(rbfrIngredientRoles).values(
        input.contributions.map((c) => ({
          ingredientId: row.id,
          domainCode: c.domainCode,
          contribution: c.contribution,
          evidence: c.evidence,
        })),
      );
    }

    return row.id;
  }

  async listIngredients(): Promise<IngredientSummary[]> {
    const rows = await groupwareDb
      .select({ id: rbfrIngredients.id, nameKo: rbfrIngredients.nameKo, inciName: rbfrIngredients.inciName })
      .from(rbfrIngredients)
      .orderBy(rbfrIngredients.id);
    return rows;
  }

  async upsertDictionaryEntries(entries: MfdsIngredientRecord[]): Promise<number> {
    if (entries.length === 0) return 0;
    await groupwareDb
      .insert(rbfrIngredientDictionary)
      .values(
        entries.map((e) => ({
          nameKo: e.nameKo,
          nameEn: e.nameEn,
          casNo: e.casNo,
          originDesc: e.originDesc,
          synonym: e.synonym,
        })),
      )
      .onConflictDoUpdate({
        target: rbfrIngredientDictionary.nameKo,
        set: {
          nameEn: sql`excluded.name_en`,
          casNo: sql`excluded.cas_no`,
          originDesc: sql`excluded.origin_desc`,
          synonym: sql`excluded.synonym`,
          syncedAt: sql`now()`,
        },
      });
    return entries.length;
  }

  async findIngredientsForRecommendation(domainCodes: string[]): Promise<IngredientRecommendationCandidate[]> {
    if (domainCodes.length === 0) return [];

    const [ingredients, roles, regulations] = await Promise.all([
      groupwareDb
        .select({ id: rbfrIngredients.id, nameKo: rbfrIngredients.nameKo, inciName: rbfrIngredients.inciName })
        .from(rbfrIngredients)
        .where(eq(rbfrIngredients.isActive, true)),
      groupwareDb
        .select({
          ingredientId: rbfrIngredientRoles.ingredientId,
          domainCode: rbfrIngredientRoles.domainCode,
          contribution: rbfrIngredientRoles.contribution,
        })
        .from(rbfrIngredientRoles)
        .where(inArray(rbfrIngredientRoles.domainCode, domainCodes)),
      groupwareDb
        .select({
          ingredientId: rbfrIngredientRegulations.ingredientId,
          regType: rbfrIngredientRegulations.regType,
        })
        .from(rbfrIngredientRegulations)
        .where(eq(rbfrIngredientRegulations.status, 'CONFIRMED')),
    ]);

    const contributionsByIngredient = new Map<number, Record<string, number>>();
    for (const r of roles) {
      const bucket = contributionsByIngredient.get(r.ingredientId) ?? {};
      bucket[r.domainCode] = r.contribution;
      contributionsByIngredient.set(r.ingredientId, bucket);
    }

    const confirmedRegulationCountByIngredient = new Map<number, number>();
    const banByIngredient = new Set<number>();
    for (const reg of regulations) {
      confirmedRegulationCountByIngredient.set(
        reg.ingredientId,
        (confirmedRegulationCountByIngredient.get(reg.ingredientId) ?? 0) + 1,
      );
      if (reg.regType === 'BAN') banByIngredient.add(reg.ingredientId);
    }

    return ingredients.map((ing) => ({
      ingredientId: ing.id,
      nameKo: ing.nameKo,
      inciName: ing.inciName,
      contributions: contributionsByIngredient.get(ing.id) ?? {},
      hasBanRegulation: banByIngredient.has(ing.id),
      hasAnyConfirmedRegulation: (confirmedRegulationCountByIngredient.get(ing.id) ?? 0) > 0,
    }));
  }
}
