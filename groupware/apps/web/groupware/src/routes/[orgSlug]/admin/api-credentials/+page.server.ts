import { redirect } from '@sveltejs/kit';
import { hasRootAuthority } from '$lib/shared/lib/auth/access';
import type { PageServerLoad } from './$types';

/**
 * /[orgSlug]/admin/api-credentials 가드: 공용 API 자격증명(외부 API 키) 관리
 * 루트 권한자(ROOT 또는 대표) 전용. 상위 admin 레이아웃이 isAdmin+slug 를, 여기서
 * hasRootAuthority 를 추가 검증한다(타일 숨김은 UX, URL 직접 접근 차단은 서버 가드 책임)
 */
export const load: PageServerLoad = async ({ locals, params }) => {
  const user = await locals.getUser();
  if (!hasRootAuthority(user)) {
    throw redirect(302, `/${params.orgSlug}/admin`);
  }
  return {};
};
