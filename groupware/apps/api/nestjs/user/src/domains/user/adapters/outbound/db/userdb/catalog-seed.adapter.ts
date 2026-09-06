import { Injectable } from '@nestjs/common';
import { and, eq, notInArray } from 'drizzle-orm';
import { userDb, features, aiTools, permissions } from '@csc/database/userdb';
import {
  AiToolCatalogSeed,
  AiToolKey,
  CatalogSeed,
  FeatureKey,
  PermissionKey,
} from '../../../../core/domain/types/entitlement-catalog';
import { CatalogSeedRepositoryPort } from '../../../../core/application/ports/outbound/catalog-seed-repository.port';

/**
 * 카탈로그 시드 어댑터 (userdb): 코드 카탈로그(SSOT) → features/ai_tools 멱등 동기화
 * 표시명/slug 는 기존 행이 있으면 보존(ON CONFLICT DO NOTHING). 정책: 포트 주석 참고
 */
@Injectable()
export class CatalogSeedRepositoryAdapter implements CatalogSeedRepositoryPort {
  async insertMissingAiTools(seeds: AiToolCatalogSeed[]): Promise<string[]> {
    if (seeds.length === 0) return [];
    const inserted = await userDb
      .insert(aiTools)
      .values(
        // slug 기본값 = key(마이그레이션 백필과 동일). 이후 플랫폼에서 편집
        // provisioning 은 신규 도구 insert 기본값: 이후 플랫폼 관리자가 토글(DB 가 SSOT, onConflict 미갱신)
        seeds.map((s) => ({
          key: s.key,
          name: s.name,
          slug: s.key,
          description: s.description,
          sortOrder: s.sortOrder,
          provisioning: s.provisioning,
        })),
      )
      .onConflictDoNothing({ target: aiTools.key })
      .returning({ key: aiTools.key });
    return inserted.map((r) => r.key);
  }

  async insertMissingFeatures(seeds: CatalogSeed<FeatureKey>[]): Promise<string[]> {
    if (seeds.length === 0) return [];
    const inserted = await userDb
      .insert(features)
      .values(
        seeds.map((s) => ({
          key: s.key,
          name: s.name,
          description: s.description,
          sortOrder: s.sortOrder,
        })),
      )
      .onConflictDoNothing({ target: features.key })
      .returning({ key: features.key });
    return inserted.map((r) => r.key);
  }

  async insertMissingPermissions(seeds: CatalogSeed<PermissionKey>[]): Promise<string[]> {
    if (seeds.length === 0) return [];
    const inserted = await userDb
      .insert(permissions)
      .values(
        seeds.map((s) => ({
          key: s.key,
          name: s.name,
          description: s.description,
          sortOrder: s.sortOrder,
        })),
      )
      .onConflictDoNothing({ target: permissions.key })
      .returning({ key: permissions.key });
    return inserted.map((r) => r.key);
  }

  async deactivateAiToolsNotIn(keys: AiToolKey[]): Promise<string[]> {
    // 빈 keys 면 전체 비활성화가 되어버리므로 가드(카탈로그는 비지 않음)
    if (keys.length === 0) return [];
    const deactivated = await userDb
      .update(aiTools)
      .set({ isActive: false })
      .where(and(notInArray(aiTools.key, keys), eq(aiTools.isActive, true)))
      .returning({ key: aiTools.key });
    return deactivated.map((r) => r.key);
  }

  async deactivateFeaturesNotIn(keys: FeatureKey[]): Promise<string[]> {
    if (keys.length === 0) return [];
    const deactivated = await userDb
      .update(features)
      .set({ isActive: false })
      .where(and(notInArray(features.key, keys), eq(features.isActive, true)))
      .returning({ key: features.key });
    return deactivated.map((r) => r.key);
  }

  async deactivatePermissionsNotIn(keys: PermissionKey[]): Promise<string[]> {
    if (keys.length === 0) return [];
    const deactivated = await userDb
      .update(permissions)
      .set({ isActive: false })
      .where(and(notInArray(permissions.key, keys), eq(permissions.isActive, true)))
      .returning({ key: permissions.key });
    return deactivated.map((r) => r.key);
  }
}
