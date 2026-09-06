// 스토리지 일괄 동작 BFF: 휴지통 이동, 복원, 영구 삭제
//
// 세 동작이 한 라우트인 이유는 요청 모양(스코프 + id 목록)과 실패 문장 구조가 같기 때문이다.
// 동작 이름은 화이트리스트로 받는다(경로에서 온 문자열을 그대로 상위 서버에 넘기지 않는다)
import type { RequestHandler } from '@sveltejs/kit';
import { fail, ok } from '$lib/server/http/bff';
import { mapStorageError, resolveStorageRequest, storagePost } from '$lib/server/storage/api';

const ACTIONS = {
  trash: { path: '/storage/items/trash', fallback: '휴지통으로 옮기지 못했습니다.' },
  restore: { path: '/storage/items/restore', fallback: '복원하지 못했습니다.' },
  purge: { path: '/storage/items/purge', fallback: '영구 삭제하지 못했습니다.' }
} as const;

type ActionKey = keyof typeof ACTIONS;

function isAction(value: string | undefined): value is ActionKey {
  return value === 'trash' || value === 'restore' || value === 'purge';
}

export const POST: RequestHandler = async (event) => {
  const action = event.params.action;
  if (!isAction(action)) return fail('알 수 없는 동작입니다.', { status: 400 });

  const body = await event.request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((v: unknown) => typeof v === 'string') : [];
  if (ids.length === 0) return fail('대상을 선택해 주세요.', { status: 400 });

  const resolved = await resolveStorageRequest(
    event,
    typeof body?.area === 'string' ? body.area : null,
    body?.departmentId == null ? null : String(body.departmentId)
  );
  if ('error' in resolved) return resolved.error;

  const { path, fallback } = ACTIONS[action];
  try {
    const res = await storagePost<{ affected: number }>(resolved.access, path, {
      scope: resolved.scope,
      ids
    });
    return ok({ affected: res.data?.affected ?? 0 });
  } catch (error) {
    return mapStorageError(error, fallback);
  }
};
