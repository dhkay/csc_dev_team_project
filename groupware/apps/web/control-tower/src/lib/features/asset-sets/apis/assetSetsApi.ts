// 에셋 세트 데이터 접근(브라우저): 세트 CRUD + 슬롯 업로드(presign/PUT/confirm → slot 지정)
//   presign 만 슬롯 전용(파티션 marketing-video/set/<slot>). 바이트 PUT, confirm 은 file-upload 공용 프리미티브 재사용
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import { bff } from '$lib/infrastructure/http/bffClient';
import type { ApiResult } from '$lib/infrastructure/http/apiResult';
import { putBytes, confirm } from '$lib/features/common-assets/apis/commonAssetsApi';
import { assetSetsContract } from '../assetSetsContract';
import type { AssetSetRecord, CreateAssetSetInput, UpdateAssetSetInput } from '../types';

export { putBytes, confirm };

interface PresignResult {
  uploadId: string;
  presignedUrl: string;
}

/** 슬롯 업로드 presign: BFF 가 scope='platform' + partition(marketing-video/set/<slot>) 주입. 실패 시 throw. */
export async function presignSlot(
  slot: string,
  fileName: string,
  mimeType: string,
  size: number,
): Promise<PresignResult> {
  const res = await frontClient().POST<{ success: boolean; data?: PresignResult; error?: string }>(
    ROUTES.PLATFORM.assetSetPresign,
    { slot, fileName, mimeType, size },
  );
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.error ?? '업로드 준비에 실패했습니다.');
  }
  return res.data.data;
}

export function createAssetSet(input: CreateAssetSetInput): Promise<ApiResult<AssetSetRecord>> {
  return bff(assetSetsContract.create, input);
}
export function updateAssetSet(
  id: number,
  patch: UpdateAssetSetInput,
): Promise<ApiResult<AssetSetRecord>> {
  return bff(assetSetsContract.update, patch, { id });
}
export function deleteAssetSet(id: number): Promise<ApiResult<{ success: boolean }>> {
  return bff(assetSetsContract.remove, undefined, { id });
}
export function setSetSlot(
  id: number,
  slot: string,
  uploadId: string,
): Promise<ApiResult<AssetSetRecord>> {
  return bff(assetSetsContract.setSlot, { uploadId }, { id, slot });
}
export function clearSetSlot(id: number, slot: string): Promise<ApiResult<AssetSetRecord>> {
  return bff(assetSetsContract.clearSlot, undefined, { id, slot });
}
