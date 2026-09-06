import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import {
  marketingDb,
  marketingAssetSets,
  marketingOrganizationAssetPacks,
} from '@csc/database/marketingdb';
import {
  AssetSetRepositoryPort,
  AssetSetValues,
  AssetSetUpdateValues,
} from '../../../../core/application/ports/outbound';
import { AssetSetEntity, SetSlot } from '../../../../core/domain';
import { toAssetSetEntity } from './mappers';

const SET_COLS = {
  id: marketingAssetSets.id,
  name: marketingAssetSets.name,
  scope: marketingAssetSets.scope,
  organizationId: marketingAssetSets.organizationId,
  packId: marketingAssetSets.packId,
  sortOrder: marketingAssetSets.sortOrder,
  frameUploadId: marketingAssetSets.frameUploadId,
  outroUploadId: marketingAssetSets.outroUploadId,
  overlays: marketingAssetSets.overlays,
} as const;

const COMMON_SCOPE = 'common';
const ORG_SCOPE = 'organization';
const PACK_SCOPE = 'pack';

/** AssetSetRepositoryPort 구현: marketingdb marketing_asset_sets(common 전역 + organization 조직 + pack 플러그인) */
@Injectable()
export class AssetSetRepositoryAdapter implements AssetSetRepositoryPort {
  /** 조직이 활성화한 팩 id 목록(부여/opt-in 공용) */
  private async enabledPackIds(organizationId: number): Promise<number[]> {
    const rows = await marketingDb
      .select({ packId: marketingOrganizationAssetPacks.packId })
      .from(marketingOrganizationAssetPacks)
      .where(eq(marketingOrganizationAssetPacks.organizationId, organizationId));
    return rows.map((r) => r.packId);
  }

  async findManyRecords(organizationId: number | null): Promise<AssetSetEntity[]> {
    // 플랫폼(null)=common 만. 조직(X)=common ∪ 자기 org ∪ 활성화한 팩
    let where;
    if (organizationId === null) {
      where = eq(marketingAssetSets.scope, COMMON_SCOPE);
    } else {
      const packs = await this.enabledPackIds(organizationId);
      const clauses = [
        eq(marketingAssetSets.scope, COMMON_SCOPE),
        and(eq(marketingAssetSets.scope, ORG_SCOPE), eq(marketingAssetSets.organizationId, organizationId)),
      ];
      if (packs.length > 0) {
        clauses.push(and(eq(marketingAssetSets.scope, PACK_SCOPE), inArray(marketingAssetSets.packId, packs)));
      }
      where = or(...clauses);
    }
    const rows = await marketingDb
      .select(SET_COLS)
      .from(marketingAssetSets)
      .where(where)
      .orderBy(asc(marketingAssetSets.scope), asc(marketingAssetSets.sortOrder), asc(marketingAssetSets.id));
    return rows.map(toAssetSetEntity);
  }

  async findOneRecordById(id: number): Promise<AssetSetEntity | null> {
    const [row] = await marketingDb
      .select(SET_COLS)
      .from(marketingAssetSets)
      .where(eq(marketingAssetSets.id, id));
    return row ? toAssetSetEntity(row) : null;
  }

  async createRecord(values: AssetSetValues): Promise<AssetSetEntity> {
    const [row] = await marketingDb
      .insert(marketingAssetSets)
      .values({
        scope: values.scope,
        organizationId: values.organizationId,
        name: values.name,
        createdByAdminId: values.createdByAdminId,
        overlays: values.overlays,
      })
      .returning(SET_COLS);
    return toAssetSetEntity(row);
  }

  async updateOneRecordById(id: number, values: AssetSetUpdateValues): Promise<AssetSetEntity | null> {
    const [row] = await marketingDb
      .update(marketingAssetSets)
      .set({ name: values.name, overlays: values.overlays, updatedAt: new Date() })
      .where(eq(marketingAssetSets.id, id))
      .returning(SET_COLS);
    return row ? toAssetSetEntity(row) : null;
  }

  async deleteOneRecordById(id: number): Promise<boolean> {
    const deleted = await marketingDb
      .delete(marketingAssetSets)
      .where(eq(marketingAssetSets.id, id))
      .returning({ id: marketingAssetSets.id });
    return deleted.length > 0;
  }

  async updateSlotUpload(
    id: number,
    slot: SetSlot,
    uploadId: string | null,
  ): Promise<AssetSetEntity | null> {
    const patch =
      slot === 'frame' ? { frameUploadId: uploadId } : { outroUploadId: uploadId };
    const [row] = await marketingDb
      .update(marketingAssetSets)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(marketingAssetSets.id, id))
      .returning(SET_COLS);
    return row ? toAssetSetEntity(row) : null;
  }
}
