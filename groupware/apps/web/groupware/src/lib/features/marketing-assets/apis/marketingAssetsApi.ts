// 조직 자산 데이터 접근(브라우저): 같은 origin BFF(/api/marketing/{assets,asset-sets})를 frontClient 로 호출
//   업로드(presign/PUT/confirm)는 공용 uploadBlob 시퀀스 재사용(presign 라우트만 카테고리/슬롯별). 목록은 SSR.
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import { run, type ApiResult } from '$lib/infrastructure/http/apiResult';
import type { SetOverlays } from '../types';

const ASSETS = ROUTES.MARKETING.ASSETS;
const SETS = ROUTES.MARKETING.ASSET_SETS;

// 풀 자산
export interface CreateAssetInput {
  category: string;
  uploadId: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  tagIds?: number[];
}
export function createAsset(input: CreateAssetInput): Promise<ApiResult<unknown>> {
  return run(() => frontClient().POST(ASSETS, input));
}
/** 표시명/태그 수정: 제공된 필드만 전송 */
export interface UpdateAssetPatch {
  name?: string;
  tagIds?: number[];
}
export function updateAsset(id: number, patch: UpdateAssetPatch): Promise<ApiResult<unknown>> {
  return run(() => frontClient().PATCH(`${ASSETS}/${id}`, patch));
}
export function deleteAsset(id: number): Promise<ApiResult<unknown>> {
  return run(() => frontClient().DELETE(`${ASSETS}/${id}`));
}

// 세트
export interface UpdateSetPatch {
  name?: string;
  overlays?: SetOverlays | null;
}
export function createSet(
  name: string,
  overlays?: SetOverlays | null,
): Promise<ApiResult<{ id: number }>> {
  return run(() => frontClient().POST(SETS, { name, ...(overlays ? { overlays } : {}) }));
}
export function updateSet(id: number, patch: UpdateSetPatch): Promise<ApiResult<unknown>> {
  return run(() => frontClient().PATCH(`${SETS}/${id}`, patch));
}
export function deleteSet(id: number): Promise<ApiResult<unknown>> {
  return run(() => frontClient().DELETE(`${SETS}/${id}`));
}
export function setSetSlot(id: number, slot: string, uploadId: string): Promise<ApiResult<unknown>> {
  return run(() => frontClient().PUT(`${SETS}/${id}/slots/${encodeURIComponent(slot)}`, { uploadId }));
}
export function clearSetSlot(id: number, slot: string): Promise<ApiResult<unknown>> {
  return run(() => frontClient().DELETE(`${SETS}/${id}/slots/${encodeURIComponent(slot)}`));
}
