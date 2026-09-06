import { InferSelectModel } from 'drizzle-orm';
import { marketingCommonAssets } from '@csc/database/marketingdb';
import { CommonAssetEntity, CommonAssetCategory, CommonAssetTag } from '../../../../../core/domain';

type CommonAssetRow = InferSelectModel<typeof marketingCommonAssets>;

/** Drizzle 공통 에셋 행 + 조인한 태그 → Domain CommonAssetEntity. */
export function toCommonAssetEntity(
  row: Pick<
    CommonAssetRow,
    | 'id'
    | 'category'
    | 'scope'
    | 'organizationId'
    | 'packId'
    | 'uploadId'
    | 'name'
    | 'mimeType'
    | 'sizeBytes'
    | 'sortOrder'
  >,
  tags: CommonAssetTag[],
): CommonAssetEntity {
  return {
    id: row.id,
    category: row.category as CommonAssetCategory,
    scope: row.scope,
    organizationId: row.organizationId,
    packId: row.packId,
    uploadId: row.uploadId,
    name: row.name,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sortOrder: row.sortOrder,
    tags,
  };
}
