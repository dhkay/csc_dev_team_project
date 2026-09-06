// 업로드 확인 BFF: file-upload `POST /uploads/{id}/confirm` 로 중계(서비스토큰 자동 주입)
// 디스크 존재 검증 후 UPLOADED 로 전이하고 브라우저 접근 URL(access_url)을 돌려준다.
import type { RequestEvent } from '@sveltejs/kit';
import { serverStorageClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

interface UploadAssetResponse {
  access_url: string;
}

export async function POST(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;

  try {
    const { uploadId } = await event.request.json();
    if (typeof uploadId !== 'string' || !uploadId) {
      return fail('잘못된 요청입니다.', { status: 400 });
    }

    const res = await serverStorageClient().POST<UploadAssetResponse>(
      `/uploads/${encodeURIComponent(uploadId)}/confirm`,
    );

    return ok({ accessUrl: res.data.access_url });
  } catch (error) {
    return mapHttpError(error, {
      fallback: '업로드 확인에 실패했습니다.',
      log: 'Confirm failed',
      table: {
        ...AUTH_ERROR_RULES,
        404: { message: '업로드된 파일을 찾을 수 없습니다.' }
      }
    });
  }
}
