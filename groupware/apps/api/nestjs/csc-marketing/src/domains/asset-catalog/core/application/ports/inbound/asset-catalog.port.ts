import { AssetAxisEntity, AssetTagEntity, AxisWithTags } from '../../../domain';
import type { AssetOwner } from '../../../../../../shared/domain/scoped-ownership';

export interface CreateAxisInput {
  category: string;
  key: string;
  label: string;
  hint?: string;
  sortOrder?: number;
}
export interface CreateTagInput {
  axisId: number;
  value: string;
  label?: string;
  sortOrder?: number;
}

/**
 * 태그 카탈로그 Inbound Port: 축/태그 조회(트리) + 생성/삭제. owner 로 스코프
 *   owner=null(플랫폼): common 만 조회/편집.  owner=orgId(조직): common ∪ 자기 org 조회, 자기 org 만 편집
 * 조직은 공통 축 아래에 자기 태그를 더하거나, 자기 전용 축을 만들 수 있다(공통은 읽기 전용)
 * (수정/이름변경/토글은 현재 UI 미노출: 필요 시 update 계열을 가산.) 인가는 BFF 에서
 */
export interface AssetCatalogPort {
  listAxesWithTags(owner: AssetOwner, category?: string): Promise<AxisWithTags[]>;
  createAxis(input: CreateAxisInput, owner: AssetOwner): Promise<AssetAxisEntity>;
  /** 대상이 owner 소유가 아니면 false. */
  deleteAxis(id: number, owner: AssetOwner): Promise<boolean>;
  /** 태그 추가: 축은 owner 가 볼 수 있어야(공통 또는 자기 org). 아니면 null. */
  createTag(input: CreateTagInput, owner: AssetOwner): Promise<AssetTagEntity | null>;
  deleteTag(id: number, owner: AssetOwner): Promise<boolean>;
}

export const ASSET_CATALOG_PORT = Symbol('ASSET_CATALOG_PORT');
