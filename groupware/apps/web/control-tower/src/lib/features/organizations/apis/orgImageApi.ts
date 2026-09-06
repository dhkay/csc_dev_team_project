// 조직 로고 업로드: file-upload BFF(presign/confirm) + 프리사인 절대 URL 직접 PUT.
// presign/confirm 은 같은 origin BFF(frontClient). 바이트 PUT 만 서명 토큰 때문에 BFF 불가 → raw fetch.
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';

interface PresignResult {
  uploadId: string;
  presignedUrl: string;
}

/** presign: BFF 가 scope='platform' 주입. 실패 시 throw. */
export async function presign(
  fileName: string,
  mimeType: string,
  size: number,
): Promise<PresignResult> {
  const res = await frontClient().POST<{ success: boolean; data?: PresignResult; error?: string }>(
    ROUTES.FILE_UPLOAD.IMAGE,
    { fileName, mimeType, size },
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

/** confirm: 업로드 확정(UPLOADED 전이). 저장 대상은 uploadId(불변): URL 은 렌더 시 서명 발급하므로 저장 안 함 */
export async function confirm(uploadId: string): Promise<void> {
  const res = await frontClient().POST<{ success: boolean; error?: string }>(
    ROUTES.FILE_UPLOAD.CONFIRM,
    { uploadId },
  );
  if (!res.data.success) {
    throw new Error(res.data.error ?? '업로드 확인에 실패했습니다.');
  }
}
