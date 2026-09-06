// 스토리지 업로드 확인 BFF: 대기 상태의 자산을 확정해 목록에 드러낸다.
//
// 확인을 하지 않고 남은 자산은 하루 뒤 수거자가 거둔다. 그래서 업로드가 중간에 끊겨도
// 목록에는 반쯤 올라간 파일이 나타나지 않고, 고아 바이트도 쌓이지 않는다.
import type { RequestHandler } from '@sveltejs/kit';
import { fail, ok } from '$lib/server/http/bff';
import { mapStorageError, resolveStorageRequest, storagePost } from '$lib/server/storage/api';

export const POST: RequestHandler = async (event) => {
  const body = await event.request.json().catch(() => null);
  const uploadId = typeof body?.uploadId === 'string' ? body.uploadId : '';
  if (!uploadId) return fail('업로드 대상이 없습니다.', { status: 400 });

  const resolved = await resolveStorageRequest(
    event,
    typeof body?.area === 'string' ? body.area : null,
    body?.departmentId == null ? null : String(body.departmentId)
  );
  if ('error' in resolved) return resolved.error;

  try {
    await storagePost(
      resolved.access,
      `/storage/files/${encodeURIComponent(uploadId)}/confirm`,
      { scope: resolved.scope }
    );
    return ok();
  } catch (error) {
    return mapStorageError(error, '업로드 확인에 실패했습니다.');
  }
};
