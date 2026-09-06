import { CommonAssetCategory, CommonAssetEntity } from '../../../domain';
import type { AssetOwner } from '../../../../../../shared/domain/scoped-ownership';

/** 저장 값(자산 행): 서비스가 트림/스코프 확정 후 넘긴다. 태그는 별도 replaceTags 로 */
export interface CommonAssetValues {
  category: CommonAssetCategory;
  scope: string;
  organizationId: number | null;
  uploadId: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  createdByAdminId: number | null;
}

/** 수정 값: 표시명만(태그는 replaceTags 로 분리) */
export interface CommonAssetUpdateValues {
  name: string;
}

/** 공통 에셋 레포지토리 아웃바운드 포트 (marketingdb). 조회 결과에 카탈로그 태그를 조인해 채운다. */
export interface CommonAssetRepositoryPort {
  /**
   * 조회: organizationId 유무로 스코프 결정
   *   null   → scope='common' 만(플랫폼)
   *   number → scope='common' ∪ (scope='organization' AND org=X) ∪ (scope='pack' AND pack 활성화된 것)
   * 카테고리, sortOrder 정렬. 각 자산의 태그를 조인해 반환
   */
  findManyRecords(organizationId: number | null): Promise<CommonAssetEntity[]>;
  /** id 단건(태그 포함). 없으면 null. */
  findOneRecordById(id: number): Promise<CommonAssetEntity | null>;
  createRecord(values: CommonAssetValues): Promise<CommonAssetEntity>;
  /** id 로 표시명 수정. 없으면 null. */
  updateOneRecordById(
    id: number,
    values: CommonAssetUpdateValues,
  ): Promise<CommonAssetEntity | null>;
  /** 삭제(멱등). 실제 삭제 시 true. */
  deleteOneRecordById(id: number): Promise<boolean>;
  /**
   * 주어진 tagIds 중 유효한 것만 반환(유효성 필터)
   * 유효 = 카테고리 축 소속 + 활성 + owner 가시성(공통 ∪ 자기 org 태그/축). owner=null(플랫폼)은 공통만
   */
  filterValidTagIds(category: string, tagIds: number[], owner: AssetOwner): Promise<number[]>;
  /** 자산의 태그 링크를 통째로 교체(삭제 후 삽입) */
  replaceTags(assetId: number, tagIds: number[]): Promise<void>;
}

export const COMMON_ASSET_REPOSITORY_PORT = Symbol('COMMON_ASSET_REPOSITORY_PORT');
