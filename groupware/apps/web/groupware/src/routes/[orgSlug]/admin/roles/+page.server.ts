import { redirect } from '@sveltejs/kit';
import { canManageOrg } from '$lib/shared/lib/auth/access';
import type { PageServerLoad } from './$types';

/**
 * /[orgSlug]/admin/roles 가드: 권한 관리(ROOT 또는 시스템관리 권한 보유자)
 * 사용자 관리(users), 조직 관리(organization)와 동일 패턴: 상위 admin 레이아웃이 isAdmin+slug 를,
 * 여기서 canManageOrg 를 추가 검증한다(타일 숨김은 UX, URL 직접 접근 차단은 서버 가드 책임)
 */
export const load: PageServerLoad = async ({ locals, params }) => {
  const user = await locals.getUser();
  if (!canManageOrg(user)) {
    throw redirect(302, `/${params.orgSlug}/admin`);
  }
  return {};
};
