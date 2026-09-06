// 업로드 취소 BFF: 확정되지 않은 자산을 서버에서 지금 버린다.
//
// 이 경로가 없어도 정확성은 깨지지 않는다. 확정되지 않은 자산은 하루 뒤 수거자가 거두기 때문이다.
// 그런데 200MB 를 올리다 취소할 때마다 그 바이트가 하루를 디스크에 앉아 있는 것은 다른 문제라,
// 취소가 곧바로 정리하도록 한 걸음 앞당긴다. 실패는 호출부가 무시한다.
import type { RequestHandler } from '@sveltejs/kit';
import { fail, ok } from '$lib/server/http/bff';
import { mapStorageError, resolveStorageRequest, storagePost } from '$lib/server/storage/api';

export const POST: RequestHandler = async (event) => {
  const body = await event.request.json().catch(() => null);
  const uploadId = typeof body?.uploadId === 'string' ? body.uploadId : '';
  if (!uploadId) return fail('대상이 없습니다.', { status: 400 });

  const resolved = await resolveStorageRequest(
    event,
    typeof body?.area === 'string' ? body.area : null,
    body?.departmentId == null ? null : String(body.departmentId)
  );
  if ('error' in resolved) return resolved.error;

  try {
    const res = await storagePost<{ affected: number }>(
      resolved.access,
      `/storage/files/${encodeURIComponent(uploadId)}/discard`,
      { scope: resolved.scope }
    );
    return ok({ affected: res.data?.affected ?? 0 });
  } catch (error) {
    return mapStorageError(error, '업로드를 취소하지 못했습니다.');
  }
};
