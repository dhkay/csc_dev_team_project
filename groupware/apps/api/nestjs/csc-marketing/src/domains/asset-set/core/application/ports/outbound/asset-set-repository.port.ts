import { AssetSetEntity, SetSlot } from '../../../domain';
import type { SetOverlayStyles } from '../../../../../../shared/domain/overlay';

/** 세트 저장 값 */
export interface AssetSetValues {
  name: string;
  scope: string;
  organizationId: number | null;
  createdByAdminId: number | null;
  overlays: SetOverlayStyles | null;
}

/** 세트 수정 값: 이름 + 구역별 오버레이 스타일 */
export interface AssetSetUpdateValues {
  name: string;
  overlays: SetOverlayStyles | null;
}

/** 에셋 세트 레포지토리 아웃바운드 포트 (marketingdb: scope='common' 전역 + 'organization' 조직) */
export interface AssetSetRepositoryPort {
  /**
   * 조회: organizationId 유무로 스코프 결정
   *   null   → scope='common' 만(플랫폼)
   *   number → scope='common' ∪ (scope='organization' AND organizationId=X)(조직)
   */
  findManyRecords(organizationId: number | null): Promise<AssetSetEntity[]>;
  findOneRecordById(id: number): Promise<AssetSetEntity | null>;
  createRecord(values: AssetSetValues): Promise<AssetSetEntity>;
  updateOneRecordById(id: number, values: AssetSetUpdateValues): Promise<AssetSetEntity | null>;
  deleteOneRecordById(id: number): Promise<boolean>;
  /** 슬롯(frame/outro) uploadId 갱신(null=비우기, 파생 뮤테이션이라 Record 접미사 면제). set 없으면 null. */
  updateSlotUpload(id: number, slot: SetSlot, uploadId: string | null): Promise<AssetSetEntity | null>;
}

export const ASSET_SET_REPOSITORY_PORT = Symbol('ASSET_SET_REPOSITORY_PORT');
