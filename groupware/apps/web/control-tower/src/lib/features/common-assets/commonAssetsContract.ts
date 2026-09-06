// 공통 에셋 BFF 엔드포인트 타입 계약: 등록(POST)/수정(PATCH :id)/삭제(DELETE :id)
//   presign 은 {uploadId,presignedUrl} 을 돌려주는 raw api(apis/commonAssetsApi.presign): 계약 밖
import { defineRoute } from '$lib/infrastructure/http/bffClient';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { CommonAssetRecord, CreateCommonAssetInput, UpdateCommonAssetInput } from './types';

export const commonAssetsContract = {
  create: defineRoute<CreateCommonAssetInput, CommonAssetRecord>(
    'POST',
    ROUTES.PLATFORM.COMMON_ASSETS,
  ),
  update: defineRoute<UpdateCommonAssetInput, CommonAssetRecord, { id: number }>('PATCH', (p) =>
    ROUTES.PLATFORM.commonAsset(p.id),
  ),
  remove: defineRoute<void, { success: boolean }, { id: number }>('DELETE', (p) =>
    ROUTES.PLATFORM.commonAsset(p.id),
  ),
};
