import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import {
  marketingDb,
  marketingCommonAssets,
  marketingCommonAssetTags,
  marketingAssetTags,
  marketingAssetAxes,
  marketingOrganizationAssetPacks,
} from '@csc/database/marketingdb';
import {
  CommonAssetRepositoryPort,
  CommonAssetValues,
  CommonAssetUpdateValues,
} from '../../../../core/application/ports/outbound';
import { CommonAssetEntity, CommonAssetTag } from '../../../../core/domain';
import type { AssetOwner } from '../../../../../../shared/domain/scoped-ownership';
import { toCommonAssetEntity } from './mappers';

/** 엔티티로 투영할 컬럼(타임스탬프/감사는 DB 에만). scope/organizationId/packId 는 소유권, 가시성 판별에 노출 */
const COLS = {
  id: marketingCommonAssets.id,
  category: marketingCommonAssets.category,
  scope: marketingCommonAssets.scope,
  organizationId: marketingCommonAssets.organizationId,
  packId: marketingCommonAssets.packId,
  uploadId: marketingCommonAssets.uploadId,
  name: marketingCommonAssets.name,
  mimeType: marketingCommonAssets.mimeType,
  sizeBytes: marketingCommonAssets.sizeBytes,
  sortOrder: marketingCommonAssets.sortOrder,
} as const;

const COMMON_SCOPE = 'common';
const ORG_SCOPE = 'organization';
const PACK_SCOPE = 'pack';

/** CommonAssetRepositoryPort 구현: marketingdb (common 전역 + organization 조직 + pack 플러그인). 태그는 카탈로그 조인 */
@Injectable()
export class CommonAssetRepositoryAdapter implements CommonAssetRepositoryPort {
  /** 조직이 활성화한 팩 id 목록(부여/opt-in 공용) */
  private async enabledPackIds(organizationId: number): Promise<number[]> {
    const rows = await marketingDb
      .select({ packId: marketingOrganizationAssetPacks.packId })
      .from(marketingOrganizationAssetPacks)
      .where(eq(marketingOrganizationAssetPacks.organizationId, organizationId));
    return rows.map((r) => r.packId);
  }

  /** 자산 id 목록 → 자산별 태그(카탈로그 조인, 축, 태그 순서 유지) */
  private async tagsByAssetIds(ids: number[]): Promise<Map<number, CommonAssetTag[]>> {
    const map = new Map<number, CommonAssetTag[]>();
    if (ids.length === 0) return map;
    const rows = await marketingDb
      .select({
        assetId: marketingCommonAssetTags.commonAssetId,
        tagId: marketingAssetTags.id,
        axisKey: marketingAssetAxes.key,
        value: marketingAssetTags.value,
        label: marketingAssetTags.label,
        scope: marketingAssetTags.scope,
      })
      .from(marketingCommonAssetTags)
      .innerJoin(marketingAssetTags, eq(marketingAssetTags.id, marketingCommonAssetTags.tagId))
      .innerJoin(marketingAssetAxes, eq(marketingAssetAxes.id, marketingAssetTags.axisId))
      .where(inArray(marketingCommonAssetTags.commonAssetId, ids))
      .orderBy(asc(marketingAssetAxes.sortOrder), asc(marketingAssetTags.sortOrder), asc(marketingAssetTags.id));
    for (const r of rows) {
      const tag: CommonAssetTag = {
        tagId: r.tagId,
        axisKey: r.axisKey,
        value: r.value,
        label: r.label,
        scope: r.scope === ORG_SCOPE ? 'organization' : 'common',
      };
      const arr = map.get(r.assetId);
      if (arr) arr.push(tag);
      else map.set(r.assetId, [tag]);
    }
    return map;
  }

  private async hydrate(
    rows: {
      id: number;
      category: string;
      scope: string;
      organizationId: number | null;
      packId: number | null;
      uploadId: string;
      name: string;
      mimeType: string;
      sizeBytes: number | null;
      sortOrder: number;
    }[],
  ): Promise<CommonAssetEntity[]> {
    const tagMap = await this.tagsByAssetIds(rows.map((r) => r.id));
    return rows.map((r) => toCommonAssetEntity(r, tagMap.get(r.id) ?? []));
  }

  async findManyRecords(organizationId: number | null): Promise<CommonAssetEntity[]> {
    // 플랫폼(null)=common 만. 조직(X)=common ∪ 자기 org ∪ 활성화한 팩
    let where;
    if (organizationId === null) {
      where = eq(marketingCommonAssets.scope, COMMON_SCOPE);
    } else {
      const packs = await this.enabledPackIds(organizationId);
      const clauses = [
        eq(marketingCommonAssets.scope, COMMON_SCOPE),
        and(
          eq(marketingCommonAssets.scope, ORG_SCOPE),
          eq(marketingCommonAssets.organizationId, organizationId),
        ),
      ];
      if (packs.length > 0) {
        clauses.push(
          and(eq(marketingCommonAssets.scope, PACK_SCOPE), inArray(marketingCommonAssets.packId, packs)),
        );
      }
      where = or(...clauses);
    }
    const rows = await marketingDb
      .select(COLS)
      .from(marketingCommonAssets)
      .where(where)
      .orderBy(
        asc(marketingCommonAssets.scope),
        asc(marketingCommonAssets.category),
        asc(marketingCommonAssets.sortOrder),
        asc(marketingCommonAssets.id),
      );
    return this.hydrate(rows);
  }

  async findOneRecordById(id: number): Promise<CommonAssetEntity | null> {
    const [row] = await marketingDb.select(COLS).from(marketingCommonAssets).where(eq(marketingCommonAssets.id, id));
    if (!row) return null;
    const [hydrated] = await this.hydrate([row]);
    return hydrated;
  }

  async createRecord(values: CommonAssetValues): Promise<CommonAssetEntity> {
    const [row] = await marketingDb
      .insert(marketingCommonAssets)
      .values({
        category: values.category,
        scope: values.scope,
        organizationId: values.organizationId,
        uploadId: values.uploadId,
        name: values.name,
        mimeType: values.mimeType,
        sizeBytes: values.sizeBytes,
        createdByAdminId: values.createdByAdminId,
      })
      .returning(COLS);
    return toCommonAssetEntity(row, []);
  }

  async updateOneRecordById(
    id: number,
    values: CommonAssetUpdateValues,
  ): Promise<CommonAssetEntity | null> {
    const [row] = await marketingDb
      .update(marketingCommonAssets)
      .set({ name: values.name, updatedAt: new Date() })
      .where(eq(marketingCommonAssets.id, id))
      .returning(COLS);
    if (!row) return null;
    const [hydrated] = await this.hydrate([row]);
    return hydrated;
  }

  async deleteOneRecordById(id: number): Promise<boolean> {
    // common_asset_tags 링크는 FK cascade 로 함께 삭제
    const deleted = await marketingDb
      .delete(marketingCommonAssets)
      .where(eq(marketingCommonAssets.id, id))
      .returning({ id: marketingCommonAssets.id });
    return deleted.length > 0;
  }

  async filterValidTagIds(category: string, tagIds: number[], owner: AssetOwner): Promise<number[]> {
    if (tagIds.length === 0) return [];
    // owner 가시성: 공통(null org) 이거나, 조직이면 자기 org 태그/축까지. 플랫폼(owner=null)은 공통만
    const tagVisible =
      owner === null
        ? eq(marketingAssetTags.scope, 'common')
        : or(
            eq(marketingAssetTags.scope, 'common'),
            and(eq(marketingAssetTags.scope, 'organization'), eq(marketingAssetTags.organizationId, owner)),
          );
    const axisVisible =
      owner === null
        ? eq(marketingAssetAxes.scope, 'common')
        : or(
            eq(marketingAssetAxes.scope, 'common'),
            and(eq(marketingAssetAxes.scope, 'organization'), eq(marketingAssetAxes.organizationId, owner)),
          );
    const rows = await marketingDb
      .select({ id: marketingAssetTags.id })
      .from(marketingAssetTags)
      .innerJoin(marketingAssetAxes, eq(marketingAssetAxes.id, marketingAssetTags.axisId))
      .where(
        and(
          inArray(marketingAssetTags.id, tagIds),
          eq(marketingAssetAxes.category, category),
          eq(marketingAssetTags.isActive, true),
          eq(marketingAssetAxes.isActive, true),
          tagVisible,
          axisVisible,
        ),
      );
    return rows.map((r) => r.id);
  }

  async replaceTags(assetId: number, tagIds: number[]): Promise<void> {
    await marketingDb
      .delete(marketingCommonAssetTags)
      .where(eq(marketingCommonAssetTags.commonAssetId, assetId));
    const unique = [...new Set(tagIds)];
    if (unique.length > 0) {
      await marketingDb
        .insert(marketingCommonAssetTags)
        .values(unique.map((tagId) => ({ commonAssetId: assetId, tagId })));
    }
  }
}
