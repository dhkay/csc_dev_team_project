// src/routes/api/auth/logout/+server.ts
// 서버단 로그아웃: user 서버에 refresh 토큰 무효화를 요청한 뒤 쿠키를 삭제한다.
// user 호출이 실패해도(네트워크 등) 로컬 쿠키는 반드시 정리한다(best-effort)
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverUserClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_COOKIE_CONFIG } from '$lib/app/config/cookies';
import { clearTokens } from '$lib/shared/lib/utils/authTokenUtils';

export async function POST({ cookies }: RequestEvent) {
  const refreshToken = cookies.get(AUTH_COOKIE_CONFIG.REFRESH_TOKEN.name);

  if (refreshToken) {
    try {
      await serverUserClient().POST('/user-api/logout', { refreshToken });
    } catch (error) {
      // 무효화 실패는 치명적이지 않음. 쿠키 삭제로 클라이언트 세션은 종료된다.
      console.error('Logout (server invalidate) failed:', error instanceof Error ? error.message : 'unknown');
    }
  }

  clearTokens(cookies);
  return json({ success: true });
}
