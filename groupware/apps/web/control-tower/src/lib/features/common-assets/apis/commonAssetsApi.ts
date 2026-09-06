// 공통 에셋 데이터 접근(브라우저): presign/PUT/confirm(업로드) + 계약 기반 등록/삭제
//   presign/confirm 은 같은 origin BFF(frontClient). 바이트 PUT 만 서명 토큰 때문에 raw fetch(BFF 우회)
//   목록 조회는 SSR(+page.server.ts 의 serverMarketingClient)에서 직접
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import { bff } from '$lib/infrastructure/http/bffClient';
import type { ApiResult } from '$lib/infrastructure/http/apiResult';
import { commonAssetsContract } from '../commonAssetsContract';
import type {
  CommonAssetCategory,
  CommonAssetRecord,
  CreateCommonAssetInput,
  UpdateCommonAssetInput,
} from '../types';

interface PresignResult {
  uploadId: string;
  presignedUrl: string;
}

/** presign: BFF 가 scope='platform' + partition(marketing-video/<cat>) 주입. 실패 시 throw. */
export async function presign(
  category: CommonAssetCategory,
  fileName: string,
  mimeType: string,
  size: number,
): Promise<PresignResult> {
  const res = await frontClient().POST<{ success: boolean; data?: PresignResult; error?: string }>(
    ROUTES.PLATFORM.commonAssetPresign,
    { category, fileName, mimeType, size },
  );
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.error ?? '업로드 준비에 실패했습니다.');
  }
  return res.data.data;
}

/** 바이트 직접 PUT: presigned 절대 URL(서명 토큰 포함). BFF 우회(정상 패턴). 실패 시 throw. */
export async function putBytes(presignedUrl: string, file: File, mimeType: string): Promise<void> {
  const res = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: file,
  });
  if (!res.ok) throw new Error('파일 업로드에 실패했습니다.');
}

/** confirm: 업로드 확정(PENDING→UPLOADED). file-upload 공용 confirm 재사용. 실패 시 throw. */
export async function confirm(uploadId: string): Promise<void> {
  const res = await frontClient().POST<{ success: boolean; error?: string }>(
    ROUTES.FILE_UPLOAD.CONFIRM,
    { uploadId },
  );
  if (!res.data.success) throw new Error(res.data.error ?? '업로드 확인에 실패했습니다.');
}

export function createCommonAsset(
  input: CreateCommonAssetInput,
): Promise<ApiResult<CommonAssetRecord>> {
  return bff(commonAssetsContract.create, input);
}

export function updateCommonAsset(
  id: number,
  patch: UpdateCommonAssetInput,
): Promise<ApiResult<CommonAssetRecord>> {
  return bff(commonAssetsContract.update, patch, { id });
}

export function deleteCommonAsset(id: number): Promise<ApiResult<{ success: boolean }>> {
  return bff(commonAssetsContract.remove, undefined, { id });
}
