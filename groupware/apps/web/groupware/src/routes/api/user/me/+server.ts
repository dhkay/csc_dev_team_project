// 현재 유저(+조직) 조회/수정 BFF: 브라우저 features(account)용. user 서버를 중계한다.
// (SSR 가드/레이아웃은 hooks.server.ts getUser() 를 그대로 쓴다. 이건 클라이언트 fetch 용.)
import type { RequestHandler } from '@sveltejs/kit';
import { authUserClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';
import type { CurrentUser } from '$lib/shared/types/common.types';

export const GET: RequestHandler = async (event) => {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const res = await authUserClient(event).GET<CurrentUser>('/user-api/find/data');
    return ok(res.data);
  } catch {
    return fail('사용자 정보를 불러오지 못했습니다.', { status: 502 });
  }
};

// 본인 프로필 수정: user 서버 PATCH /user-api/me 로 중계(역할 게이팅은 user 서버가 강제)
export const PATCH: RequestHandler = async (event) => {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const patch = await event.request.json();
    await authUserClient(event).PATCH('/user-api/me', patch);
    return ok();
  } catch (error) {
    return mapHttpError(error, {
      fallback: '프로필 수정에 실패했습니다.',
      log: 'Update profile failed',
      table: {
        401: { message: '변경 권한이 없습니다.' },
        403: { message: '변경 권한이 없습니다.' }
      }
    });
  }
};
