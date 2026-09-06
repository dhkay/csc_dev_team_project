import { redirect } from '@sveltejs/kit';
import { isPlatformAdmin } from '$lib/shared/lib/auth/platform';
import type { LayoutServerLoad } from './$types';

/**
 * (app) 그룹 가드: PLATFORM 관리자(백엔드 검증)만 통과. 그 외는 /login.
 * 인증, 셸이 필요한 모든 페이지가 이 그룹 아래에서 가드, 셸을 상속한다.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
  const user = await locals.getUser();
  if (!isPlatformAdmin(user)) {
    throw redirect(302, '/login');
  }
  return { user };
};
