import { InferSelectModel } from 'drizzle-orm';
import { marketingAssetAxes, marketingAssetTags } from '@csc/database/marketingdb';
import { AssetAxisEntity, AssetTagEntity } from '../../../../../core/domain';

type AxisRow = InferSelectModel<typeof marketingAssetAxes>;
type TagRow = InferSelectModel<typeof marketingAssetTags>;

export function toAxisEntity(
  row: Pick<
    AxisRow,
    'id' | 'scope' | 'organizationId' | 'category' | 'key' | 'label' | 'hint' | 'sortOrder' | 'isActive'
  >,
): AssetAxisEntity {
  return {
    id: row.id,
    scope: row.scope,
    organizationId: row.organizationId,
    category: row.category,
    key: row.key,
    label: row.label,
    hint: row.hint,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

export function toTagEntity(
  row: Pick<
    TagRow,
    'id' | 'axisId' | 'scope' | 'organizationId' | 'value' | 'label' | 'sortOrder' | 'isActive'
  >,
): AssetTagEntity {
  return {
    id: row.id,
    axisId: row.axisId,
    scope: row.scope,
    organizationId: row.organizationId,
    value: row.value,
    label: row.label,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}
