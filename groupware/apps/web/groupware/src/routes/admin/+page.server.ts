import { redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/shared/lib/auth/access';
import type { PageServerLoad } from './$types';

/**
 * 슬러그 없는 관리자 진입점 → 사용자 조직의 /{slug}/admin 으로 교정
 * 실제 인가(role/조직 검증)는 /[orgSlug]/admin 레이아웃 가드가 단일 출처로 수행한다.
 */
export const load: PageServerLoad = async ({ locals }) => {
  const user = await locals.getUser();
  if (!isAdmin(user) || !user?.organization?.slug) {
    throw redirect(302, '/login');
  }
  throw redirect(307, `/${user.organization.slug}/admin`);
};
