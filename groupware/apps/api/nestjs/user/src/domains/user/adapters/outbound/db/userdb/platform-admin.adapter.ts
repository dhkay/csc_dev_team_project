import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { userDb, adminUsers, adminFeatures, adminUserFeatures } from '@csc/database/userdb';
import { PlatformAdminEntity } from '../../../../core/domain/entities/user.entity';
import { UserRole, UserStatus } from '../../../../core/domain/types/user.types';
import {
  AdminFeatureCatalogItem,
  CreatePlatformAdminRecord,
  PlatformAdminRepositoryPort,
} from '../../../../core/application/ports/outbound/platform-admin-repository.port';
import { toPlatformAdminEntity } from './mappers';

/**
 * platform_admins 아웃바운드 어댑터: 벤더 운영자 정체성(조직 없음)
 * email 전역 유일이라 조회에 org 스코프가 없다(users 어댑터와 분리)
 */
@Injectable()
export class PlatformAdminRepositoryAdapter implements PlatformAdminRepositoryPort {
  async findOneRecordByEmail(email: string): Promise<PlatformAdminEntity | null> {
    const row = await userDb.query.adminUsers.findFirst({
      where: eq(adminUsers.email, email),
    });
    return row ? toPlatformAdminEntity(row) : null;
  }

  async findOneRecordById(id: number): Promise<PlatformAdminEntity | null> {
    const row = await userDb.query.adminUsers.findFirst({
      where: eq(adminUsers.id, id),
    });
    return row ? toPlatformAdminEntity(row) : null;
  }

  async createRecord(record: CreatePlatformAdminRecord): Promise<PlatformAdminEntity> {
    const [row] = await userDb
      .insert(adminUsers)
      .values({
        email: record.email,
        passwordHash: record.passwordHash,
        name: record.name,
        role: record.role ?? UserRole.ROOT,
        status: record.status ?? UserStatus.ACTIVE,
      })
      .returning();
    return toPlatformAdminEntity(row);
  }

  async updatePasswordHashRecord(id: number, passwordHash: string): Promise<void> {
    await userDb
      .update(adminUsers)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(adminUsers.id, id));
  }

  async updateLoginSecurityRecord(
    id: number,
    failedLoginAttempts: number,
    lockedUntil: Date | null,
  ): Promise<void> {
    await userDb
      .update(adminUsers)
      .set({ failedLoginAttempts, lockedUntil, updatedAt: new Date() })
      .where(eq(adminUsers.id, id));
  }

  async incrementTokenVersionRecord(id: number): Promise<void> {
    await userDb
      .update(adminUsers)
      .set({ tokenVersion: sql`${adminUsers.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(adminUsers.id, id));
  }

  async findManyAdminRecords(): Promise<PlatformAdminEntity[]> {
    const rows = await userDb.query.adminUsers.findMany({
      orderBy: asc(adminUsers.createdAt),
    });
    return rows.map(toPlatformAdminEntity);
  }

  async updateAdminRecord(
    id: number,
    patch: { name?: string; email?: string },
  ): Promise<void> {
    await userDb
      .update(adminUsers)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.email !== undefined ? { email: patch.email } : {}),
        updatedAt: new Date(),
      })
      .where(eq(adminUsers.id, id));
  }

  async deleteAdminRecord(id: number): Promise<void> {
    // admin_user_features 는 FK cascade 로 함께 제거
    await userDb.delete(adminUsers).where(eq(adminUsers.id, id));
  }

  async findManyAdminFeatureRecords(): Promise<AdminFeatureCatalogItem[]> {
    const rows = await userDb
      .select({
        key: adminFeatures.key,
        name: adminFeatures.name,
        description: adminFeatures.description,
        sortOrder: adminFeatures.sortOrder,
      })
      .from(adminFeatures)
      .where(eq(adminFeatures.isActive, true))
      .orderBy(asc(adminFeatures.sortOrder));
    return rows;
  }

  async findAdminFeatureKeys(adminId: number): Promise<string[]> {
    const rows = await userDb
      .select({ key: adminFeatures.key })
      .from(adminUserFeatures)
      .innerJoin(adminFeatures, eq(adminFeatures.id, adminUserFeatures.adminFeatureId))
      .where(and(eq(adminUserFeatures.adminUserId, adminId), eq(adminFeatures.isActive, true)));
    return rows.map((r) => r.key);
  }

  async setAdminFeaturesRecord(adminId: number, featureKeys: string[]): Promise<void> {
    await userDb.transaction(async (tx) => {
      const desired = featureKeys.length
        ? await tx
            .select({ id: adminFeatures.id })
            .from(adminFeatures)
            .where(and(inArray(adminFeatures.key, featureKeys), eq(adminFeatures.isActive, true)))
        : [];
      const desiredIds = desired.map((f) => f.id);

      await tx
        .delete(adminUserFeatures)
        .where(
          desiredIds.length
            ? and(
                eq(adminUserFeatures.adminUserId, adminId),
                notInArray(adminUserFeatures.adminFeatureId, desiredIds),
              )
            : eq(adminUserFeatures.adminUserId, adminId),
        );

      if (desiredIds.length) {
        await tx
          .insert(adminUserFeatures)
          .values(desiredIds.map((adminFeatureId) => ({ adminUserId: adminId, adminFeatureId })))
          .onConflictDoNothing();
      }
    });
  }

  async resolveAdminFeatures(adminId: number, role: UserRole): Promise<string[]> {
    // ROOT 는 활성 카탈로그 전체 보유. 그 외(ADMIN)는 부여된 것만
    if (role === UserRole.ROOT) {
      const rows = await userDb
        .select({ key: adminFeatures.key })
        .from(adminFeatures)
        .where(eq(adminFeatures.isActive, true));
      return rows.map((r) => r.key);
    }
    return this.findAdminFeatureKeys(adminId);
  }
}
