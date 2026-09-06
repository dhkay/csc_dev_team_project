import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/**
 * 인증 영역(일반 사용자) 가드: 단일 출처
 * 로그인한 사용자만 통과시키고, 하위 모든 페이지에 백엔드 검증된 user 를 주입한다.
 *
 * 새 인증 페이지는 이 그룹 아래에 두기만 하면 가드 + user 주입을 상속한다(개별 가드 불필요)
 * 역할(role) 인가가 필요한 영역은 별도 가드를 둔다(예: /[orgSlug]/admin)
 */
export const load: LayoutServerLoad = async ({ locals }) => {
  const user = await locals.getUser();
  if (!user) {
    throw redirect(302, '/login');
  }
  return { user };
};
