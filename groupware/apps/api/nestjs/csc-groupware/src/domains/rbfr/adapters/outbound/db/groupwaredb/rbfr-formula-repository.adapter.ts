/**
 * RbfrFormulaRepositoryPort의 Drizzle 구현. groupwaredb를 직접 사용한다(다른 계층은 이 포트를
 * 통해서만 이 어댑터에 접근한다 — core는 Drizzle을 모른다).
 *
 * 아직 실제 DB에 `drizzle-kit migrate`를 실행하지 않아 이 어댑터는 컴파일만 확인된 상태다
 * (rbfr/develop_status.md "확인 필요" 참고). 실제 통합 테스트는 마이그레이션 이후 진행한다.
 */
import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  groupwareDb,
  rbfrFormulaIngredients,
  rbfrFormulaConditions,
  rbfrFormulaConditionCodes,
  rbfrFormulaCountries,
  rbfrFormulaRatios,
  rbfrRoleDomains,
  rbfrIngredientRoles,
  rbfrIngredientInteractions,
  rbfrIngredients,
  rbfrIngredientRegulations,
  rbfrIngredientIncompat,
  rbfrIngredientFlags,
  rbfrIngredientCerts,
  rbfrIngredientPrices,
} from '@csc/database/groupwaredb';
import type {
  ConcentrationLimit,
  FormulaConditions,
  FormulaIngredientInput,
  IngredientCertEligibility,
  IngredientHlbProfile,
  IngredientIncompatEntry,
  IngredientNoaddFlag,
  IngredientPhRange,
  IngredientRegulationEntry,
  IngredientRoleContribution,
  IngredientUnitPrice,
  IntegratedRoleInput,
  InteractionCoefficient,
  PinnedIngredient,
} from '../../../../core/domain/types';
import type { RbfrFormulaRepositoryPort } from '../../../../core/application/ports/outbound';

const EMPTY_CONDITIONS: FormulaConditions = { excludedNoaddCodes: [], requiredCertCodes: [] };

@Injectable()
export class RbfrFormulaRepositoryAdapter implements RbfrFormulaRepositoryPort {
  async findFormulaIngredients(formulaId: number): Promise<FormulaIngredientInput[]> {
    const rows = await groupwareDb
      .select({ ingredientId: rbfrFormulaIngredients.ingredientId, actualPct: rbfrFormulaIngredients.actualPct })
      .from(rbfrFormulaIngredients)
      .where(eq(rbfrFormulaIngredients.formulaId, formulaId));

    return rows.map((r) => ({
      ingredientId: String(r.ingredientId),
      percent: r.actualPct !== null ? Number(r.actualPct) : 0,
    }));
  }

  async findPinnedIngredients(formulaId: number): Promise<PinnedIngredient[]> {
    const rows = await groupwareDb
      .select({
        ingredientId: rbfrFormulaIngredients.ingredientId,
        isPinned: rbfrFormulaIngredients.isPinned,
        pinnedPct: rbfrFormulaIngredients.pinnedPct,
      })
      .from(rbfrFormulaIngredients)
      .where(eq(rbfrFormulaIngredients.formulaId, formulaId));

    return rows.map((r) => ({
      ingredientId: String(r.ingredientId),
      isPinned: r.isPinned,
      pinnedPercent: r.pinnedPct !== null ? Number(r.pinnedPct) : undefined,
    }));
  }

  async findFormulaConditions(formulaId: number): Promise<FormulaConditions> {
    const [conditionRow] = await groupwareDb
      .select({ targetPhMin: rbfrFormulaConditions.targetPhMin, targetPhMax: rbfrFormulaConditions.targetPhMax })
      .from(rbfrFormulaConditions)
      .where(eq(rbfrFormulaConditions.formulaId, formulaId));

    const codeRows = await groupwareDb
      .select({ codeType: rbfrFormulaConditionCodes.codeType, code: rbfrFormulaConditionCodes.code })
      .from(rbfrFormulaConditionCodes)
      .where(eq(rbfrFormulaConditionCodes.formulaId, formulaId));

    return {
      targetPhMin: conditionRow?.targetPhMin !== undefined && conditionRow?.targetPhMin !== null ? Number(conditionRow.targetPhMin) : undefined,
      targetPhMax: conditionRow?.targetPhMax !== undefined && conditionRow?.targetPhMax !== null ? Number(conditionRow.targetPhMax) : undefined,
      excludedNoaddCodes: codeRows.filter((r) => r.codeType === 'NOADD').map((r) => r.code),
      requiredCertCodes: codeRows.filter((r) => r.codeType === 'CERT').map((r) => r.code),
    };
  }

  async findFormulaCountryCodes(formulaId: number): Promise<string[]> {
    const rows = await groupwareDb
      .select({ countryCode: rbfrFormulaCountries.countryCode })
      .from(rbfrFormulaCountries)
      .where(eq(rbfrFormulaCountries.formulaId, formulaId));
    return rows.map((r) => r.countryCode);
  }

  async findDirectDomainCodes(profileCode: string): Promise<string[]> {
    const rows = await groupwareDb
      .select({ domainCode: rbfrRoleDomains.domainCode })
      .from(rbfrRoleDomains)
      .where(and(eq(rbfrRoleDomains.profileCode, profileCode), eq(rbfrRoleDomains.domainType, 'DIRECT'), eq(rbfrRoleDomains.isActive, true)))
      .orderBy(rbfrRoleDomains.sortOrder);
    return rows.map((r) => r.domainCode);
  }

  async findIntegratedDomainCode(profileCode: string): Promise<string | null> {
    const [row] = await groupwareDb
      .select({ domainCode: rbfrRoleDomains.domainCode })
      .from(rbfrRoleDomains)
      .where(and(eq(rbfrRoleDomains.profileCode, profileCode), eq(rbfrRoleDomains.domainType, 'INTEGRATED'), eq(rbfrRoleDomains.isActive, true)))
      .limit(1);
    return row?.domainCode ?? null;
  }

  async findIntegratedRoleInput(formulaId: number, integratedDomainCode: string): Promise<IntegratedRoleInput> {
    const [row] = await groupwareDb
      .select({ targetRatio: rbfrFormulaRatios.targetRatio, evidence: rbfrFormulaRatios.evidence })
      .from(rbfrFormulaRatios)
      .where(and(eq(rbfrFormulaRatios.formulaId, formulaId), eq(rbfrFormulaRatios.domainCode, integratedDomainCode)));

    // 근거(evidence)가 없으면 통합역할은 미입력으로 취급한다(05번 원칙5) — 값이 있어도 근거 없이는 안 쓴다.
    const hasEvidence = !!row?.evidence && row.evidence.trim().length > 0;
    return {
      domainCode: integratedDomainCode,
      hasEvidence,
      value: hasEvidence ? Number(row!.targetRatio) : 0,
    };
  }

  async findContributions(ingredientIds: number[], domainCodes: string[]): Promise<IngredientRoleContribution[]> {
    if (ingredientIds.length === 0 || domainCodes.length === 0) return [];
    const rows = await groupwareDb
      .select({
        ingredientId: rbfrIngredientRoles.ingredientId,
        domainCode: rbfrIngredientRoles.domainCode,
        contribution: rbfrIngredientRoles.contribution,
      })
      .from(rbfrIngredientRoles)
      .where(and(inArray(rbfrIngredientRoles.ingredientId, ingredientIds), inArray(rbfrIngredientRoles.domainCode, domainCodes)));

    return rows.map((r) => ({ ingredientId: String(r.ingredientId), domainCode: r.domainCode, contribution: r.contribution }));
  }

  async findInteractionCoefficients(ingredientIds: number[], domainCodes: string[]): Promise<InteractionCoefficient[]> {
    if (ingredientIds.length === 0 || domainCodes.length === 0) return [];
    const rows = await groupwareDb
      .select({
        ingredientAId: rbfrIngredientInteractions.ingredientAId,
        ingredientBId: rbfrIngredientInteractions.ingredientBId,
        domainCode: rbfrIngredientInteractions.domainCode,
        coefficient: rbfrIngredientInteractions.coefficient,
      })
      .from(rbfrIngredientInteractions)
      .where(
        and(
          inArray(rbfrIngredientInteractions.ingredientAId, ingredientIds),
          inArray(rbfrIngredientInteractions.ingredientBId, ingredientIds),
          inArray(rbfrIngredientInteractions.domainCode, domainCodes),
        ),
      );

    return rows.map((r) => ({
      ingredientAId: String(r.ingredientAId),
      ingredientBId: String(r.ingredientBId),
      domainCode: r.domainCode,
      coefficient: Number(r.coefficient),
    }));
  }

  async findConcentrationLimits(ingredientIds: number[]): Promise<ConcentrationLimit[]> {
    if (ingredientIds.length === 0) return [];
    const rows = await groupwareDb
      .select({ id: rbfrIngredients.id, concMin: rbfrIngredients.concMin })
      .from(rbfrIngredients)
      .where(inArray(rbfrIngredients.id, ingredientIds));

    return rows.map((r) => ({
      ingredientId: String(r.id),
      recommendedMinPercent: r.concMin !== null ? Number(r.concMin) : undefined,
    }));
  }

  async findRegulations(ingredientIds: number[]): Promise<IngredientRegulationEntry[]> {
    if (ingredientIds.length === 0) return [];
    const rows = await groupwareDb
      .select({
        ingredientId: rbfrIngredientRegulations.ingredientId,
        countryCode: rbfrIngredientRegulations.countryCode,
        regType: rbfrIngredientRegulations.regType,
        limitPct: rbfrIngredientRegulations.limitPct,
        status: rbfrIngredientRegulations.status,
      })
      .from(rbfrIngredientRegulations)
      .where(inArray(rbfrIngredientRegulations.ingredientId, ingredientIds));

    return rows.map((r) => ({
      ingredientId: String(r.ingredientId),
      countryCode: r.countryCode,
      regType: r.regType,
      limitPercent: r.limitPct !== null ? Number(r.limitPct) : undefined,
      status: r.status,
    }));
  }

  async findIncompat(ingredientIds: number[]): Promise<IngredientIncompatEntry[]> {
    if (ingredientIds.length === 0) return [];
    const rows = await groupwareDb
      .select({
        ingredientId: rbfrIngredientIncompat.ingredientId,
        otherId: rbfrIngredientIncompat.otherId,
        severity: rbfrIngredientIncompat.severity,
        reason: rbfrIngredientIncompat.reason,
      })
      .from(rbfrIngredientIncompat)
      .where(and(inArray(rbfrIngredientIncompat.ingredientId, ingredientIds), inArray(rbfrIngredientIncompat.otherId, ingredientIds)));

    return rows.map((r) => ({
      ingredientAId: String(r.ingredientId),
      ingredientBId: String(r.otherId),
      severity: r.severity,
      reason: r.reason ?? undefined,
    }));
  }

  async findNoaddFlags(ingredientIds: number[]): Promise<IngredientNoaddFlag[]> {
    if (ingredientIds.length === 0) return [];
    const rows = await groupwareDb
      .select({ ingredientId: rbfrIngredientFlags.ingredientId, noaddCode: rbfrIngredientFlags.noaddCode })
      .from(rbfrIngredientFlags)
      .where(inArray(rbfrIngredientFlags.ingredientId, ingredientIds));

    return rows.map((r) => ({ ingredientId: String(r.ingredientId), noaddCode: r.noaddCode }));
  }

  async findCerts(ingredientIds: number[]): Promise<IngredientCertEligibility[]> {
    if (ingredientIds.length === 0) return [];
    const rows = await groupwareDb
      .select({ ingredientId: rbfrIngredientCerts.ingredientId, certCode: rbfrIngredientCerts.certCode, isEligible: rbfrIngredientCerts.isEligible })
      .from(rbfrIngredientCerts)
      .where(inArray(rbfrIngredientCerts.ingredientId, ingredientIds));

    return rows.map((r) => ({ ingredientId: String(r.ingredientId), certCode: r.certCode, isEligible: r.isEligible }));
  }

  async findPhRanges(ingredientIds: number[]): Promise<IngredientPhRange[]> {
    if (ingredientIds.length === 0) return [];
    const rows = await groupwareDb
      .select({ id: rbfrIngredients.id, phMin: rbfrIngredients.phMin, phMax: rbfrIngredients.phMax })
      .from(rbfrIngredients)
      .where(inArray(rbfrIngredients.id, ingredientIds));

    return rows.map((r) => ({
      ingredientId: String(r.id),
      phMin: r.phMin !== null ? Number(r.phMin) : undefined,
      phMax: r.phMax !== null ? Number(r.phMax) : undefined,
    }));
  }

  async findHlbProfiles(ingredientIds: number[]): Promise<IngredientHlbProfile[]> {
    if (ingredientIds.length === 0) return [];
    const rows = await groupwareDb
      .select({ id: rbfrIngredients.id, hlb: rbfrIngredients.hlb, emulsionRole: rbfrIngredients.emulsionRole, solubility: rbfrIngredients.solubility })
      .from(rbfrIngredients)
      .where(inArray(rbfrIngredients.id, ingredientIds));

    return rows.map((r) => ({
      ingredientId: String(r.id),
      // 실제 스키마에는 phase_type 컬럼이 없다 — solubility(수용성/유용성)에서 유상부 여부를 추정한다.
      phaseType: r.solubility === 'oil_soluble' ? 'oil' : r.solubility === 'water_soluble' ? 'water' : 'other',
      hlb: r.hlb !== null ? Number(r.hlb) : undefined,
      emulsionRole: r.emulsionRole ? 'emulsifier' : 'none',
    }));
  }

  async findUnitPrices(ingredientIds: number[]): Promise<IngredientUnitPrice[]> {
    if (ingredientIds.length === 0) return [];
    // 원료마다 최신 기준일(base_date) 단가 한 행만 취한다.
    const rows = await groupwareDb
      .selectDistinctOn([rbfrIngredientPrices.ingredientId], {
        ingredientId: rbfrIngredientPrices.ingredientId,
        unitPrice: rbfrIngredientPrices.unitPrice,
      })
      .from(rbfrIngredientPrices)
      .where(inArray(rbfrIngredientPrices.ingredientId, ingredientIds))
      .orderBy(rbfrIngredientPrices.ingredientId, desc(rbfrIngredientPrices.baseDate));

    return rows.map((r) => ({ ingredientId: String(r.ingredientId), pricePerGram: Number(r.unitPrice) }));
  }
}
