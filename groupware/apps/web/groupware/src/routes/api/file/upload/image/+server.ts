// 이미지 presign BFF: file-upload `POST /uploads/presign` 로 중계(서비스토큰 자동 주입)
// scope='groupware' + partition=orgId 를 BFF 가 주입한다(브라우저가 저장 폴더를 선택하지 못하게)
//  → object_key=groupware/<orgId>/<uuid>. orgId 는 백엔드 검증 세션에서 도출(클라 비선택)
import type { RequestEvent } from '@sveltejs/kit';
import { serverStorageClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

interface PresignResponse {
  upload_id: string;
  presigned_url: string;
}

export async function POST(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;

  const user = await event.locals.getUser();
  const orgId = user?.organization?.id;
  if (!orgId) {
    return fail('조직 정보를 확인할 수 없습니다.', { status: 403 });
  }

  try {
    const { fileName, mimeType, size } = await event.request.json();
    if (typeof fileName !== 'string' || typeof mimeType !== 'string' || typeof size !== 'number') {
      return fail('잘못된 요청입니다.', { status: 400 });
    }

    const res = await serverStorageClient().POST<PresignResponse>('/uploads/presign', {
      file_name: fileName,
      mime_type: mimeType,
      size,
      scope: 'groupware',
      partition: String(orgId),
      organization_id: orgId,
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
