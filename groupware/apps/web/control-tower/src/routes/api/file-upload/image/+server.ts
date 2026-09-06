// 이미지 presign BFF: file-upload `POST /uploads/presign` 로 중계(서비스토큰 자동 주입)
// scope='platform' 을 BFF 가 주입한다(브라우저가 저장 폴더를 선택하지 못하게) → object_key=platform/<uuid>.
// 플랫폼 관리자 전용 화면에서만 호출되므로 access 토큰 존재를 게이트로 둔다.
import type { RequestEvent } from '@sveltejs/kit';
import { serverStorageClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';
import type { PresignResponse } from '$lib/server/upload/presign';

export async function POST(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;

  try {
    const { fileName, mimeType, size } = await event.request.json();
    if (typeof fileName !== 'string' || typeof mimeType !== 'string' || typeof size !== 'number') {
      return fail('잘못된 요청입니다.', { status: 400 });
    }

    const res = await serverStorageClient().POST<PresignResponse>('/uploads/presign', {
      file_name: fileName,
      mime_type: mimeType,
      size,
      scope: 'platform',
    });

    return ok({ uploadId: res.data.upload_id, presignedUrl: res.data.presigned_url });
  } catch (error) {
    return mapHttpError(error, {
      fallback: '업로드 준비에 실패했습니다.',
      log: 'Presign failed',
      table: {
        ...AUTH_ERROR_RULES,
        400: { message: '업로드할 수 없는 파일입니다.' }
      }
    });
  }
}
