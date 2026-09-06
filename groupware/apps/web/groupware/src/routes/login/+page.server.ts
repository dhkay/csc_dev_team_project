import { redirect } from '@sveltejs/kit';
import { resolveGroupwareDefaultDestination } from '$lib/server/navigation/defaultDestination';
import type { PageServerLoad } from './$types';

/**
 * 이미 로그인된 사용자에게 로그인 폼을 다시 보여주지 않는다.
 * 목적지 판정을 영역 가드(/admin, /[orgSlug]/admin)와 동일하게 백엔드 검증(getUser)으로 맞춰,
 * 토큰 클레임과 가드가 어긋나 생기는 리디렉트 루프를 구조적으로 차단한다.
 * (미인증, 백엔드 미응답 시 user=null → 로그인 폼 그대로 렌더)
 */
export const load: PageServerLoad = async (event) => {
  const user = await event.locals.getUser();
  if (!user) return {};
  const destination = resolveGroupwareDefaultDestination(user);
  if (destination === '/login') return {};
  throw redirect(302, destination);
};
