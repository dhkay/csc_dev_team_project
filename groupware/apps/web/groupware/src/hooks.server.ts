// src/hooks.server.ts
import type { Handle, RequestEvent } from '@sveltejs/kit';
import { authUserClient, serverUserClient } from '$lib/infrastructure/http/serverClientInstances';
import {
	AUTH_COOKIE_CONFIG,
	AUTO_LOGIN_COOKIE_CONFIG,
	authCookieOptions,
} from '$lib/app/config/cookies';
import { withCorrelationScope } from '@csc/net-utils';
import {
	checkTokenStatus,
	clearTokens,
	getTokenPayload,
	getTokenEntitlements,
	isAutoLoginEnabled,
} from '$lib/shared/lib/utils/authTokenUtils';
import type { CurrentUser, RefreshTokenResponse } from '$lib/shared/types/common.types';

/**
 * 요청 스코프 현재 유저 로더 주입: 같은 요청 내 중복 호출 시 단일 Promise 공유
 * 클로저가 `event.locals.accessToken`을 지연 참조하므로 토큰 갱신 시점과 무관하게 최신 값 사용
 */
function attachGetUser(event: RequestEvent): void {
	let cache: Promise<CurrentUser | null> | null = null;
	event.locals.getUser = () => {
		if (!event.locals.accessToken) return Promise.resolve(null);
		if (cache) return cache;
		cache = authUserClient(event)
			.GET<CurrentUser>('/user-api/find/data')
			.then((r) => {
				const u = r.data;
				if (!u) return null;
				// 유효 엔타이틀먼트(aiTools/permissions)는 access 토큰 클레임에서 도출: 백엔드 인가와 동일 출처
				return { ...u, ...getTokenEntitlements(event.locals.accessToken) };
			})
			.catch(() => null);
		return cache;
	};
}

/**
 * 토큰 갱신 처리 로직
 * User API를 직접 호출하여 서버사이드에서 토큰 갱신
 */
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
			console.log('[Token Refresh] 토큰 갱신 시도...');

			try {
				// refreshToken 은 body 로만 전달: URL path 박기 금지 (access log, referer 누출 차단)
				const client = serverUserClient();
				const response = await client.POST<RefreshTokenResponse>(
					'/user-api/refresh',
					{ refreshToken },
				);

				const newTokens = response.data;

				// event.locals에 새 액세스 토큰 설정
				event.locals.accessToken = newTokens.token;
				const payload = getTokenPayload(newTokens.token);
				event.locals.userId = (payload?.id as number) ?? null;

				// 쿠키에 새로운 토큰 쌍 저장: 로그인 때 고른 모드(지속\세션)를 그대로 유지한다.
				const autoLogin = isAutoLoginEnabled(cookies);
				cookies.set(
					AUTH_COOKIE_CONFIG.ACCESS_TOKEN.name,
					newTokens.token,
					authCookieOptions(AUTH_COOKIE_CONFIG.ACCESS_TOKEN, autoLogin)
				);
				cookies.set(
					AUTH_COOKIE_CONFIG.REFRESH_TOKEN.name,
					newTokens.refreshToken,
					authCookieOptions(AUTH_COOKIE_CONFIG.REFRESH_TOKEN, autoLogin)
				);
				// 플래그도 함께 연장한다. 이게 리프레시 쿠키보다 먼저 만료되면, 갱신은 되는데
				// 모드만 세션으로 떨어져 자동 로그인이 조용히 풀린다.
				if (autoLogin) {
					cookies.set(AUTO_LOGIN_COOKIE_CONFIG.name, '1', AUTO_LOGIN_COOKIE_CONFIG.options);
				}

				console.log('[Token Refresh] 토큰 갱신 완료');
			} catch (error: unknown) {
				const axiosError = error as { response?: { status?: number } };
				const status = axiosError.response?.status;

				if (status === 401 || status === 403) {
					// 백엔드가 명시적으로 거부 (인증 만료/무효) → 토큰 삭제
					clearTokens(cookies);
					console.error('[Token Refresh] 토큰 갱신 거부 (인증 만료):', status);
				} else {
					// 네트워크 에러 또는 기타 서버 에러: 쿠키 유지 + 만료된 토큰이라도 설정
					event.locals.accessToken = accessToken || null;
					console.warn('[Token Refresh] 갱신 실패: 토큰 유지, 페이지에서 재시도:', status || 'network error');
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
	// 기본값 초기화
	event.locals.userId = null;

	// 인증 관련 API는 갱신 훅을 거치지 않고 기존 쿠키만 반영
	// (/api/auth/refresh, /api/auth/logout 내부 동작과 충돌 방지)
	if (event.url.pathname.startsWith('/api/auth/')) {
		const accessToken = event.cookies.get(AUTH_COOKIE_CONFIG.ACCESS_TOKEN.name);
		if (accessToken) {
			event.locals.accessToken = accessToken;
		}
		attachGetUser(event);
		return resolve(event);
	}

	// 페이지 요청 + 일반 API 요청 모두 토큰 갱신 처리
	await handleTokenRefresh(event);

	// 토큰 반영 이후 요청 스코프 유저 로더 주입 (최신 accessToken 참조)
	attachGetUser(event);

	return resolve(event);
};

/**
 * BFF 는 시스템의 진입점이라 여기서 trace 가 태어난다.
 * 가장 바깥에 두어 토큰 갱신 실패 등 모든 경로가 상관관계를 갖게 한다.
 */
export const handle: Handle = async ({ event, resolve }) =>
	withCorrelationScope(event.request.headers, () => handleRequest({ event, resolve }));
