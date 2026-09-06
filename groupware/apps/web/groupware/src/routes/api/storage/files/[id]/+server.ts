// 스토리지 파일 이름 변경 BFF. 저장 경로는 바뀌지 않으므로 이미 발급된 접근 주소는 그대로 유효하다.
import type { RequestHandler } from '@sveltejs/kit';
import { fail, ok } from '$lib/server/http/bff';
import { mapStorageError, resolveStorageRequest, storagePatch } from '$lib/server/storage/api';

export const PATCH: RequestHandler = async (event) => {
  const id = event.params.id ?? '';
  if (!id) return fail('대상이 없습니다.', { status: 400 });

  const body = await event.request.json().catch(() => null);
  const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : '';
  if (!fileName) return fail('이름을 입력해 주세요.', { status: 400 });

  const resolved = await resolveStorageRequest(
    event,
    typeof body?.area === 'string' ? body.area : null,
    body?.departmentId == null ? null : String(body.departmentId)
  );
  if ('error' in resolved) return resolved.error;

  try {
    await storagePatch(resolved.access, `/storage/files/${encodeURIComponent(id)}`, {
      scope: resolved.scope,
      file_name: fileName
    });
    return ok();
  } catch (error) {
    return mapStorageError(error, '이름을 바꾸지 못했습니다.');
  }
};
