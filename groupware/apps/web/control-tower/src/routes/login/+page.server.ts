import { redirect } from '@sveltejs/kit';
import { isPlatformAdmin } from '$lib/shared/lib/auth/platform';
import type { PageServerLoad } from './$types';

/**
 * 이미 PLATFORM 관리자로 인증된 상태면 홈으로 이동(로그인 페이지 재노출 방지)
 * 판정을 (app) 레이아웃 가드와 동일하게 백엔드 검증(getUser)으로 맞춰,
 * 토큰 클레임과 가드가 어긋나 생기는 리디렉트 루프를 구조적으로 차단한다.
 */
export const load: PageServerLoad = async ({ locals }) => {
  const user = await locals.getUser();
  if (isPlatformAdmin(user)) {
    throw redirect(302, '/');
  }
  return {};
};
