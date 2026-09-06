/** RbfrSettingsRepositoryPort의 Drizzle 구현. groupwaredb를 직접 사용한다. */
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  groupwareDb,
  rbfrProfiles,
  rbfrRoleDomains,
  rbfrCellRuleLimits,
  rbfrCellMapping,
} from '@csc/database/groupwaredb';
import type {
  CellMappingEntry,
  CellMappingRow,
  CellRuleLimitSummary,
  CreateProfileInput,
  ProfileSummary,
  RoleDomainSummary,
} from '../../../../core/domain/types';
import type { RbfrSettingsRepositoryPort } from '../../../../core/application/ports/outbound';

@Injectable()
export class RbfrSettingsRepositoryAdapter implements RbfrSettingsRepositoryPort {
  async listProfiles(): Promise<ProfileSummary[]> {
    const rows = await groupwareDb.select().from(rbfrProfiles).orderBy(rbfrProfiles.sortOrder);
    return rows.map((r) => ({
      profileCode: r.profileCode,
      nameKo: r.nameKo,
      nameEn: r.nameEn ?? undefined,
      profileType: r.profileType,
      sortOrder: r.sortOrder,
      description: r.description ?? undefined,
      isActive: r.isActive,
    }));
  }

  async listRoleDomains(profileCode: string): Promise<RoleDomainSummary[]> {
    const rows = await groupwareDb
      .select()
      .from(rbfrRoleDomains)
      .where(eq(rbfrRoleDomains.profileCode, profileCode))
      .orderBy(rbfrRoleDomains.sortOrder);
    return rows.map((r) => ({
      domainCode: r.domainCode,
      profileCode: r.profileCode,
      nameKo: r.nameKo,
      nameEn: r.nameEn ?? undefined,
      domainType: r.domainType,
      sortOrder: r.sortOrder,
      description: r.description ?? undefined,
      isActive: r.isActive,
    }));
  }

  async createProfileWithRoles(
    input: CreateProfileInput,
    cellRuleLimit: { ruleVersion: string; totalMin: number; totalMax: number },
  ): Promise<void> {
    await groupwareDb.transaction(async (tx) => {
      await tx.insert(rbfrProfiles).values({
        profileCode: input.profileCode,
        nameKo: input.nameKo,
        nameEn: input.nameEn,
        profileType: input.profileType,
        description: input.description,
        isActive: false,
      });

      if (input.roles.length > 0) {
        await tx.insert(rbfrRoleDomains).values(
          input.roles.map((role, i) => ({
            domainCode: role.domainCode,
            profileCode: input.profileCode,
            nameKo: role.nameKo,
            nameEn: role.nameEn,
            domainType: role.domainType,
            sortOrder: i,
          })),
        );
      }

      await tx.insert(rbfrCellRuleLimits).values({
        ruleVersion: cellRuleLimit.ruleVersion,
        profileCode: input.profileCode,
        totalMin: cellRuleLimit.totalMin,
        totalMax: cellRuleLimit.totalMax,
        isApproved: false,
      });
    });
  }

  async setProfileActive(profileCode: string, isActive: boolean): Promise<void> {
    await groupwareDb.update(rbfrProfiles).set({ isActive }).where(eq(rbfrProfiles.profileCode, profileCode));
  }

  async listCellRuleLimits(profileCode: string): Promise<CellRuleLimitSummary[]> {
    const rows = await groupwareDb
      .select()
      .from(rbfrCellRuleLimits)
      .where(eq(rbfrCellRuleLimits.profileCode, profileCode))
      .orderBy(rbfrCellRuleLimits.ruleVersion);
    return rows.map(toCellRuleLimitSummary);
  }

  async findCellRuleLimit(ruleVersion: string): Promise<CellRuleLimitSummary | undefined> {
    const [row] = await groupwareDb
      .select()
      .from(rbfrCellRuleLimits)
      .where(eq(rbfrCellRuleLimits.ruleVersion, ruleVersion));
    return row ? toCellRuleLimitSummary(row) : undefined;
  }

  async approveCellRuleLimit(ruleVersion: string, approvedBy: string): Promise<void> {
    await groupwareDb
      .update(rbfrCellRuleLimits)
      .set({ isApproved: true, approvedBy, approvedAt: new Date() })
      .where(eq(rbfrCellRuleLimits.ruleVersion, ruleVersion));
  }

  async listCellMapping(ruleVersion: string): Promise<CellMappingRow[]> {
    const rows = await groupwareDb
      .select()
      .from(rbfrCellMapping)
      .where(eq(rbfrCellMapping.ruleVersion, ruleVersion))
      .orderBy(rbfrCellMapping.ratioFrom);
    return rows.map((r) => ({
      ruleVersion: r.ruleVersion,
      ratioFrom: Number(r.ratioFrom),
      ratioTo: Number(r.ratioTo),
      cellCount: r.cellCount,
    }));
  }

  async replaceCellMapping(ruleVersion: string, entries: CellMappingEntry[]): Promise<void> {
    await groupwareDb.transaction(async (tx) => {
      await tx.delete(rbfrCellMapping).where(eq(rbfrCellMapping.ruleVersion, ruleVersion));
      if (entries.length > 0) {
        await tx.insert(rbfrCellMapping).values(
          entries.map((e) => ({
            ruleVersion,
            ratioFrom: e.ratioFrom.toString(),
            ratioTo: e.ratioTo.toString(),
            cellCount: e.cellCount,
          })),
        );
      }
    });
  }
}

function toCellRuleLimitSummary(row: typeof rbfrCellRuleLimits.$inferSelect): CellRuleLimitSummary {
  return {
    ruleVersion: row.ruleVersion,
    profileCode: row.profileCode,
    totalMin: row.totalMin,
    totalMax: row.totalMax,
    fillDirection: row.fillDirection,
    startCell: row.startCell,
    isApproved: row.isApproved,
    approvedBy: row.approvedBy ?? undefined,
    approvedAt: row.approvedAt ?? undefined,
    note: row.note ?? undefined,
  };
}
