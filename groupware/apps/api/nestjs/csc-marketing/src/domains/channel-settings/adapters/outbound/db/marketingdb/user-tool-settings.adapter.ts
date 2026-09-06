import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { marketingDb, marketingUserToolSettings } from '@csc/database/marketingdb';
import {
  UserToolSettingsRecord,
  UserToolSettingsRepositoryPort,
} from '../../../../core/application/ports/outbound';

/**
 * 개인 도구 설정 (organization_id, owner_user_id) 유니크 1행
 * upsert 를 값마다 나눈 이유: 한 쪽만 바꾸는 호출이 나머지 값을 덮는 것 방지
 */
@Injectable()
export class UserToolSettingsRepositoryAdapter implements UserToolSettingsRepositoryPort {
  async findRecord(
    organizationId: number,
    ownerUserId: number,
  ): Promise<UserToolSettingsRecord | null> {
    const [row] = await marketingDb
      .select({
        ownerUserId: marketingUserToolSettings.ownerUserId,
        aiModels: marketingUserToolSettings.aiModels,
        brandConcepts: marketingUserToolSettings.brandConcepts,
        entryVersion: marketingUserToolSettings.entryVersion,
        defaultChannelId: marketingUserToolSettings.defaultChannelId,
      })
      .from(marketingUserToolSettings)
      .where(
        and(
          eq(marketingUserToolSettings.organizationId, organizationId),
          eq(marketingUserToolSettings.ownerUserId, ownerUserId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async upsertAiModelsRecord(
    organizationId: number,
    ownerUserId: number,
    aiModels: string,
  ): Promise<UserToolSettingsRecord> {
    return this.upsert(organizationId, ownerUserId, { aiModels });
  }

  async upsertBrandConceptsRecord(
    organizationId: number,
    ownerUserId: number,
    brandConcepts: string,
  ): Promise<UserToolSettingsRecord> {
    return this.upsert(organizationId, ownerUserId, { brandConcepts });
  }

  async upsertEntryVersionRecord(
    organizationId: number,
    ownerUserId: number,
    entryVersion: string,
  ): Promise<UserToolSettingsRecord> {
    return this.upsert(organizationId, ownerUserId, { entryVersion });
  }

  async upsertDefaultChannelRecord(
    organizationId: number,
    ownerUserId: number,
    defaultChannelId: number | null,
  ): Promise<UserToolSettingsRecord> {
    return this.upsert(organizationId, ownerUserId, { defaultChannelId });
  }

  /** 행이 없으면 생성, 있으면 준 필드만 갱신(나머지 컬럼은 기본값/기존값 유지) */
  private async upsert(
    organizationId: number,
    ownerUserId: number,
    patch: {
      aiModels?: string;
      brandConcepts?: string;
      entryVersion?: string;
      defaultChannelId?: number | null;
    },
  ): Promise<UserToolSettingsRecord> {
    const now = new Date();
    const [row] = await marketingDb
      .insert(marketingUserToolSettings)
      .values({ organizationId, ownerUserId, ...patch, updatedAt: now })
      .onConflictDoUpdate({
        target: [marketingUserToolSettings.organizationId, marketingUserToolSettings.ownerUserId],
        set: { ...patch, updatedAt: now },
      })
      .returning();
    return {
      ownerUserId: row.ownerUserId,
      aiModels: row.aiModels,
      brandConcepts: row.brandConcepts,
      entryVersion: row.entryVersion,
      defaultChannelId: row.defaultChannelId,
    };
  }
}
