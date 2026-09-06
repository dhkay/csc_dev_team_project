import { AssetSetEntity } from '../../../domain';
import type { AssetOwner } from '../../../../../../shared/domain/scoped-ownership';
import type { SetOverlayStyles } from '../../../../../../shared/domain/overlay';

/** 세트 생성 입력 */
export interface AssetSetCreateInput {
  name: string;
  // 소유 조직 id: 있으면 scope='organization', 없으면 scope='common'(플랫폼)
  organizationId?: number | null;
  createdByAdminId?: number | null;
  // 구역별 오버레이 스타일(제목/자막 배경색+폰트): 미지정이면 null.
  overlays?: SetOverlayStyles | null;
}

/** 세트 수정 입력: 이름/오버레이 스타일(제공된 필드만) */
export interface AssetSetPatch {
  name?: string;
  overlays?: SetOverlayStyles | null;
}

/** 에셋 세트 Inbound Port: 세트 CRUD + 슬롯(프레임/아웃트로) 업로드 지정/비우기(소유권 검증) */
export interface AssetSetPort {
  /** 스코프 조회: 플랫폼(null)=common, 조직(orgId)=common ∪ 자기 org. */
  list(owner: AssetOwner): Promise<AssetSetEntity[]>;
  /** 단건 조회(소유 스코프): 세트 적용 시 frame/outro 슬롯 해석용. 없거나 스코프 밖이면 null. */
  getOneById(id: number, owner: AssetOwner): Promise<AssetSetEntity | null>;
  createOne(input: AssetSetCreateInput): Promise<AssetSetEntity>;
  updateOneById(id: number, patch: AssetSetPatch, owner: AssetOwner): Promise<AssetSetEntity | null>;
  deleteOneById(id: number, owner: AssetOwner): Promise<boolean>;
  /** 슬롯(frame/outro)에 업로드 지정/교체. 소유, set 없으면 null. 슬롯 아님은 예외(400). 옛 바이트 삭제 */
  setSlot(setId: number, slot: string, uploadId: string, owner: AssetOwner): Promise<AssetSetEntity | null>;
  /** 슬롯 비우기(바이트 삭제). 소유, set 없으면 null. 슬롯 아님은 예외(400) */
  clearSlot(setId: number, slot: string, owner: AssetOwner): Promise<AssetSetEntity | null>;
}

export const ASSET_SET_PORT = Symbol('ASSET_SET_PORT');
