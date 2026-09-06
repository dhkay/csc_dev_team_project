// 에셋 세트 BFF 엔드포인트 타입 계약: 세트 CRUD + 슬롯(frame/outro) 업로드 지정/비우기
//   presign 은 {uploadId,presignedUrl} 을 돌려주는 raw api(apis/assetSetsApi.presign): 계약 밖
import { defineRoute } from '$lib/infrastructure/http/bffClient';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { AssetSetRecord, CreateAssetSetInput, UpdateAssetSetInput } from './types';

export const assetSetsContract = {
  create: defineRoute<CreateAssetSetInput, AssetSetRecord>('POST', ROUTES.PLATFORM.ASSET_SETS),
  update: defineRoute<UpdateAssetSetInput, AssetSetRecord, { id: number }>('PATCH', (p) =>
    ROUTES.PLATFORM.assetSet(p.id),
  ),
  remove: defineRoute<void, { success: boolean }, { id: number }>('DELETE', (p) =>
    ROUTES.PLATFORM.assetSet(p.id),
  ),
  setSlot: defineRoute<{ uploadId: string }, AssetSetRecord, { id: number; slot: string }>(
    'PUT',
    (p) => ROUTES.PLATFORM.assetSetSlot(p.id, p.slot),
  ),
  clearSlot: defineRoute<void, AssetSetRecord, { id: number; slot: string }>('DELETE', (p) =>
    ROUTES.PLATFORM.assetSetSlot(p.id, p.slot),
  ),
};
