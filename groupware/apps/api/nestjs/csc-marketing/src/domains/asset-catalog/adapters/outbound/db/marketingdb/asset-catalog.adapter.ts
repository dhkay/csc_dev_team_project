import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { marketingDb, marketingAssetAxes, marketingAssetTags } from '@csc/database/marketingdb';
import {
  AssetCatalogRepositoryPort,
  AxisValues,
  TagValues,
} from '../../../../core/application/ports/outbound';
import { AssetAxisEntity, AssetTagEntity } from '../../../../core/domain';
import type { AssetOwner } from '../../../../../../shared/domain/scoped-ownership';
import { toAxisEntity, toTagEntity } from './mappers';

const AXIS_COLS = {
  id: marketingAssetAxes.id,
  scope: marketingAssetAxes.scope,
  organizationId: marketingAssetAxes.organizationId,
  category: marketingAssetAxes.category,
  key: marketingAssetAxes.key,
  label: marketingAssetAxes.label,
  hint: marketingAssetAxes.hint,
  sortOrder: marketingAssetAxes.sortOrder,
  isActive: marketingAssetAxes.isActive,
} as const;

const TAG_COLS = {
  id: marketingAssetTags.id,
  axisId: marketingAssetTags.axisId,
  scope: marketingAssetTags.scope,
  organizationId: marketingAssetTags.organizationId,
  value: marketingAssetTags.value,
  label: marketingAssetTags.label,
  sortOrder: marketingAssetTags.sortOrder,
  isActive: marketingAssetTags.isActive,
} as const;

const COMMON_SCOPE = 'common';
const ORG_SCOPE = 'organization';

/** AssetCatalogRepositoryPort 구현: marketingdb 축/태그 카탈로그(common ∪ org 스코프) */
@Injectable()
export class AssetCatalogRepositoryAdapter implements AssetCatalogRepositoryPort {
  /** owner 가시성 where: 플랫폼(null)=common 만, 조직(X)=common ∪ 자기 org. */
  private axisScope(owner: AssetOwner) {
    return owner === null
      ? eq(marketingAssetAxes.scope, COMMON_SCOPE)
      : or(
          eq(marketingAssetAxes.scope, COMMON_SCOPE),
          and(eq(marketingAssetAxes.scope, ORG_SCOPE), eq(marketingAssetAxes.organizationId, owner)),
        );
  }
  private tagScope(owner: AssetOwner) {
    return owner === null
      ? eq(marketingAssetTags.scope, COMMON_SCOPE)
      : or(
          eq(marketingAssetTags.scope, COMMON_SCOPE),
          and(eq(marketingAssetTags.scope, ORG_SCOPE), eq(marketingAssetTags.organizationId, owner)),
        );
  }

  async findAxes(owner: AssetOwner, category?: string): Promise<AssetAxisEntity[]> {
    const where = category
      ? and(this.axisScope(owner), eq(marketingAssetAxes.category, category))
      : this.axisScope(owner);
    const rows = await marketingDb
      .select(AXIS_COLS)
      .from(marketingAssetAxes)
      .where(where)
      .orderBy(
        asc(marketingAssetAxes.category),
        asc(marketingAssetAxes.scope),
        asc(marketingAssetAxes.sortOrder),
        asc(marketingAssetAxes.id),
      );
    return rows.map(toAxisEntity);
  }

  async findAxisById(id: number): Promise<AssetAxisEntity | null> {
    const [row] = await marketingDb.select(AXIS_COLS).from(marketingAssetAxes).where(eq(marketingAssetAxes.id, id));
    return row ? toAxisEntity(row) : null;
  }

  async findTags(owner: AssetOwner, axisIds?: number[]): Promise<AssetTagEntity[]> {
    if (axisIds && axisIds.length === 0) return [];
    const where = axisIds
      ? and(this.tagScope(owner), inArray(marketingAssetTags.axisId, axisIds))
      : this.tagScope(owner);
    const rows = await marketingDb
      .select(TAG_COLS)
      .from(marketingAssetTags)
      .where(where)
      .orderBy(
        asc(marketingAssetTags.axisId),
        asc(marketingAssetTags.scope),
        asc(marketingAssetTags.sortOrder),
        asc(marketingAssetTags.id),
      );
    return rows.map(toTagEntity);
  }

  async findTagById(id: number): Promise<AssetTagEntity | null> {
    const [row] = await marketingDb.select(TAG_COLS).from(marketingAssetTags).where(eq(marketingAssetTags.id, id));
    return row ? toTagEntity(row) : null;
  }

  async createAxisRecord(values: AxisValues): Promise<AssetAxisEntity> {
    const [row] = await marketingDb
      .insert(marketingAssetAxes)
      .values({
        scope: values.scope,
        organizationId: values.organizationId,
        category: values.category,
        key: values.key,
        label: values.label,
        hint: values.hint,
        sortOrder: values.sortOrder,
      })
      .returning(AXIS_COLS);
    return toAxisEntity(row);
  }

  async deleteAxisRecordById(id: number): Promise<boolean> {
    const deleted = await marketingDb
      .delete(marketingAssetAxes)
      .where(eq(marketingAssetAxes.id, id))
      .returning({ id: marketingAssetAxes.id });
    return deleted.length > 0;
  }

  async createTagRecord(values: TagValues): Promise<AssetTagEntity> {
    const [row] = await marketingDb
      .insert(marketingAssetTags)
      .values({
        axisId: values.axisId,
        scope: values.scope,
        organizationId: values.organizationId,
        value: values.value,
        label: values.label,
        sortOrder: values.sortOrder,
      })
      .returning(TAG_COLS);
    return toTagEntity(row);
  }

  async deleteTagRecordById(id: number): Promise<boolean> {
    const deleted = await marketingDb
      .delete(marketingAssetTags)
      .where(eq(marketingAssetTags.id, id))
      .returning({ id: marketingAssetTags.id });
    return deleted.length > 0;
  }
}
