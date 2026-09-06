import { InferSelectModel } from 'drizzle-orm';
import { marketingAssetSets } from '@csc/database/marketingdb';
import { AssetSetEntity } from '../../../../../core/domain';

type SetRow = InferSelectModel<typeof marketingAssetSets>;

/** Drizzle 세트 행 → Domain AssetSetEntity. */
export function toAssetSetEntity(
  row: Pick<
    SetRow,
    | 'id'
    | 'name'
    | 'scope'
    | 'organizationId'
    | 'packId'
    | 'sortOrder'
    | 'frameUploadId'
    | 'outroUploadId'
    | 'overlays'
  >,
): AssetSetEntity {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    organizationId: row.organizationId,
    packId: row.packId,
    sortOrder: row.sortOrder,
    frameUploadId: row.frameUploadId,
    outroUploadId: row.outroUploadId,
    overlays: row.overlays ?? null,
  };
}
