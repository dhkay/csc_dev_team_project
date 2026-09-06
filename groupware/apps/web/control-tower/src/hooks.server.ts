import { redirect, type Handle, type RequestEvent } from '@sveltejs/kit';
import { authUserClient, serverUserClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_COOKIE_CONFIG } from '$lib/app/config/cookies';
import { withCorrelationScope } from '@csc/net-utils';
import { checkTokenStatus, clearTokens, getTokenPayload } from '$lib/shared/lib/utils/authTokenUtils';
import type { CurrentUser, RefreshTokenResponse } from '$lib/shared/types/common.types';

/** 요청 스코프 현재 유저 로더 주입: 같은 요청 내 중복 호출 시 단일 Promise 공유 */
function attachGetUser(event: RequestEvent): void {
  let cache: Promise<CurrentUser | null> | null = null;
  event.locals.getUser = () => {
    if (!event.locals.accessToken) return Promise.resolve(null);
    if (cache) return cache;
    cache = authUserClient(event)
      .GET<CurrentUser>('/user-api/find/data')
      .then((r) => r.data)
      .catch(() => null);
    return cache;
  };
}

/** 토큰 갱신 처리: user 서버를 직접 호출하여 서버사이드에서 갱신 */
async function handleTokenRefresh(event: RequestEvent): Promise<void> {
  const { cookies } = event;
  const accessToken = cookies.get(AUTH_COOKIE_CONFIG.ACCESS_TOKEN.name);
  const refreshToken = cookies.get(AUTH_COOKIE_CONFIG.REFRESH_TOKEN.name);
  const tokenStatus = checkTokenStatus(accessToken, refreshToken);

  switch (tokenStatus.status) {
    case 'no_access_token':
      return;

    case 'valid':
      event.locals.accessToken = accessToken || null;
      if (accessToken) {
        const payload = getTokenPayload(accessToken);
        event.locals.userId = (payload?.id as number) ?? null;
      }
      return;

    case 'no_refresh_token':
      clearTokens(cookies);
      return;

    case 'needs_refresh':
      try {
        const response = await serverUserClient().POST<RefreshTokenResponse>(
          '/user-api/refresh',
          { refreshToken },
        );
        const newTokens = response.data;

        event.locals.accessToken = newTokens.token;
        const payload = getTokenPayload(newTokens.token);
        event.locals.userId = (payload?.id as number) ?? null;

        cookies.set(
          AUTH_COOKIE_CONFIG.ACCESS_TOKEN.name,
          newTokens.token,
          AUTH_COOKIE_CONFIG.ACCESS_TOKEN.options,
        );
        cookies.set(
          AUTH_COOKIE_CONFIG.REFRESH_TOKEN.name,
          newTokens.refreshToken,
          AUTH_COOKIE_CONFIG.REFRESH_TOKEN.options,
        );
      } catch (error: unknown) {
        const status = (error as { response?: { status?: number } }).response?.status;
        if (status === 401 || status === 403) {
          clearTokens(cookies);
        } else {
          // 네트워크/서버 에러: 기존 토큰 유지(페이지에서 재시도 기회)
          event.locals.accessToken = accessToken || null;
        }
      }
      return;
  }
}

/**
 * 요청 처리 본체. 상관관계 컨텍스트 안에서 돌기 때문에, 여기서 파생되는 모든 백엔드 호출이
 * 같은 trace_id 를 자동으로 달고 나간다(serverClientInstances 의 인터셉터가 주입)
 */
const handleRequest: Handle = async ({ event, resolve }) => {
  // dev 전용 canonical 호스트: control-tower 는 admin.localhost 로 고정한다.
  // groupware(:5173)와 control-tower(:5174)가 둘 다 localhost 면 쿠키(host-only)를 공유해
  // 한 앱 로그인이 다른 앱 토큰을 덮어쓴다(→ 플랫폼 API 403). prod 의 도메인 분리
  // (admin.example.com)를 dev 에서도 재현하려고, 문서 네비게이션을 admin.localhost 로 보내
  // 쿠키 jar 를 분리한다. (API/HMR 요청은 제외, admin.localhost 접속은 통과: 루프 없음)
  if (import.meta.env.DEV) {
    const host = event.url.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      const accept = event.request.headers.get('accept') ?? '';
      const isDocNav =
        event.request.method === 'GET' &&
        (event.request.headers.get('sec-fetch-dest') === 'document' ||
          accept.includes('text/html'));
      if (isDocNav) {
        const target = new URL(event.url);
        target.hostname = 'admin.localhost';
        throw redirect(307, target.toString());
      }
    }
  }

  event.locals.userId = null;

  // 인증 BFF는 갱신 훅을 거치지 않고 기존 쿠키만 반영(로그인/로그아웃 동작과 충돌 방지)
  if (event.url.pathname.startsWith('/api/auth/')) {
    const accessToken = event.cookies.get(AUTH_COOKIE_CONFIG.ACCESS_TOKEN.name);
    if (accessToken) {
      event.locals.accessToken = accessToken;
    }
    attachGetUser(event);
    return resolve(event);
  }

  await handleTokenRefresh(event);
  attachGetUser(event);

  return resolve(event);
};

/**
 * BFF 는 시스템의 진입점이라 여기서 trace 가 태어난다.
 * 가장 바깥에 두어 토큰 갱신 실패 등 모든 경로가 상관관계를 갖게 한다.
 * (dev 의 admin.localhost 리다이렉트는 throw 로 빠져나가므로 헤더가 붙지 않는데, 의도된 동작이다.)
 */
export const handle: Handle = async ({ event, resolve }) =>
  withCorrelationScope(event.request.headers, () => handleRequest({ event, resolve }));
