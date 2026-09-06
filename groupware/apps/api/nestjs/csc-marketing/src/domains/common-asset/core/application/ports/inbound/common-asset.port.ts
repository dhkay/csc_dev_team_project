import { CommonAssetCategory, CommonAssetEntity } from '../../../domain';
import type { AssetOwner } from '../../../../../../shared/domain/scoped-ownership';

/** 공통 에셋 등록 입력: file-upload 업로드 완료 후 메타만 등록한다. */
export interface CommonAssetCreateInput {
  category: CommonAssetCategory;
  // 소유 조직 id: 있으면 scope='organization', 없으면 scope='common'(플랫폼)
  organizationId?: number | null;
  uploadId: string;
  name: string;
  mimeType: string;
  sizeBytes?: number | null;
  // 카탈로그 태그 id 목록. 서비스가 자산 카테고리 축에 속한 유효 태그만 남긴다. 미제공이면 태그 없음
  tagIds?: number[];
  createdByAdminId?: number | null;
}

/** 수정 입력: 제공된 필드만. tagIds 제공 시 통째로 교체(유효성 필터 후) */
export interface CommonAssetPatch {
  name?: string;
  tagIds?: number[];
}

/** 공통 에셋 Inbound Port: 플랫폼(common)/조직(organization) 스코프 조회/등록/수정/삭제 */
export interface CommonAssetPort {
  /** 스코프 조회: 플랫폼(null)=common, 조직(orgId)=common ∪ 자기 org. */
  list(owner: AssetOwner): Promise<CommonAssetEntity[]>;
  createOne(input: CommonAssetCreateInput): Promise<CommonAssetEntity>;
  /** 표시명 수정. 대상이 없거나 소유자가 아니면 null(→404) */
  updateOneById(
    id: number,
    patch: CommonAssetPatch,
    owner: AssetOwner,
  ): Promise<CommonAssetEntity | null>;
  /** 삭제(멱등): 메타 + file-upload 바이트. 소유자만. 실제 삭제 시 true. */
  deleteOneById(id: number, owner: AssetOwner): Promise<boolean>;
}

export const COMMON_ASSET_PORT = Symbol('COMMON_ASSET_PORT');
