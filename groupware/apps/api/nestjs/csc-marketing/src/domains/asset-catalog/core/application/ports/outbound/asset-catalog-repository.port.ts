import { AssetAxisEntity, AssetTagEntity } from '../../../domain';
import type { AssetOwner } from '../../../../../../shared/domain/scoped-ownership';

export interface AxisValues {
  scope: string;
  organizationId: number | null;
  category: string;
  key: string;
  label: string;
  hint: string;
  sortOrder: number;
}
export interface TagValues {
  axisId: number;
  scope: string;
  organizationId: number | null;
  value: string;
  label: string;
  sortOrder: number;
}

/** 태그 카탈로그 아웃바운드 포트 (marketingdb). 조회는 owner(플랫폼 null=common / 조직 orgId=common ∪ 자기 org)로 스코프 */
export interface AssetCatalogRepositoryPort {
  /** 축 조회: owner 로 스코프(common ∪ 자기 org). category 지정 시 그 카테고리만 */
  findAxes(owner: AssetOwner, category?: string): Promise<AssetAxisEntity[]>;
  findAxisById(id: number): Promise<AssetAxisEntity | null>;
  /** 태그 조회: owner 로 스코프. axisIds 지정 시 그 축들만 */
  findTags(owner: AssetOwner, axisIds?: number[]): Promise<AssetTagEntity[]>;
  findTagById(id: number): Promise<AssetTagEntity | null>;
  createAxisRecord(values: AxisValues): Promise<AssetAxisEntity>;
  deleteAxisRecordById(id: number): Promise<boolean>;
  createTagRecord(values: TagValues): Promise<AssetTagEntity>;
  deleteTagRecordById(id: number): Promise<boolean>;
}

export const ASSET_CATALOG_REPOSITORY_PORT = Symbol('ASSET_CATALOG_REPOSITORY_PORT');
