import type { Cookies } from '@sveltejs/kit';
import {
	toAiToolKeys,
	toOrgPosition,
	toPermissionKeys,
	type AiToolKey,
	type OrgPosition,
	type PermissionKey,
} from '@csc/entitlements';
import { AUTH_COOKIE_CONFIG, AUTO_LOGIN_COOKIE_CONFIG } from '$lib/app/config/cookies';

/**
 * JWT 토큰 페이로드 인터페이스
 */
export interface JwtPayload {
	exp?: number;
	iat?: number;
	sub?: string;
	[key: string]: unknown;
}

/**
 * JWT 페이로드 세그먼트(base64url)를 UTF-8 문자열로 디코드한다.
 * `atob` 만 쓰면 바이트가 Latin1 로 해석돼 한글 등 멀티바이트 값이 깨진다(예: "루트관리자" → "ë£¨í¸...")
 * base64url(`-`/`_`, 패딩 없음)을 표준 base64 로 정규화한 뒤 TextDecoder 로 UTF-8 복원한다.
 * (브라우저, Node SSR 양쪽에서 동작)
 */
function decodeJwtSegment(segment: string): string {
	const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(base64);
	const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
	return new TextDecoder('utf-8').decode(bytes);
}

/**
 * JWT 토큰 만료 여부 확인
 * @param token - 확인할 JWT 토큰
 * @returns 만료되었으면 true, 유효하면 false
 */
export function isTokenExpired(token: string): boolean {
	try {
		const payload = JSON.parse(decodeJwtSegment(token.split('.')[1]));
		const currentTime = Math.floor(Date.now() / 1000);

		// exp가 없거나 만료된 경우
		return !payload.exp || payload.exp < currentTime;
	} catch (error) {
		console.error('토큰 파싱 오류:', error);
		return true; // 파싱 실패시 만료로 간주
	}
}

/**
 * JWT 토큰에서 페이로드 추출
 * @param token - JWT 토큰
 * @returns 페이로드 객체 또는 null (실패시)
 */
export function getTokenPayload(token: string): JwtPayload | null {
	try {
		return JSON.parse(decodeJwtSegment(token.split('.')[1])) as JwtPayload;
	} catch (error) {
		console.error('토큰 페이로드 추출 실패:', error);
		return null;
	}
}

/**
 * access 토큰 클레임에서 유효 엔타이틀먼트(aiTools/permissions)를 추출한다.
 * 미지(unknown) key 는 가드(@csc/entitlements)로 제거하고, 토큰/클레임이 없으면 빈 배열을 반환한다.
 * 백엔드 인가(actor.permissions)와 동일 출처: UI 게이팅과 서버 집행을 일치시킨다.
 */
export function getTokenEntitlements(token: string | null | undefined): {
	aiTools: AiToolKey[];
	permissions: PermissionKey[];
	position: OrgPosition | null;
} {
	const claims = token ? getTokenPayload(token) : null;
	const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
	return {
		aiTools: toAiToolKeys(arr(claims?.aiTools)),
		permissions: toPermissionKeys(arr(claims?.permissions)),
		// 직책(대표/팀장): 권한/AI도구와 분리된 별도 차원. 대표는 hasRootAuthority 의 근거
		position: toOrgPosition(typeof claims?.position === 'string' ? claims.position : null),
	};
}

/**
 * 자동 로그인 선택 여부를 쿠키에서 읽는다. 값이 없으면 해제(= 세션 쿠키 모드)로 본다.
 * @param cookies - SvelteKit cookies 객체
 */
export function isAutoLoginEnabled(cookies: Cookies): boolean {
	return cookies.get(AUTO_LOGIN_COOKIE_CONFIG.name) === '1';
}

/**
 * 쿠키에서 토큰들을 삭제
 * @param cookies - SvelteKit cookies 객체
 */
export function clearTokens(cookies: Cookies): void {
	// COOKIE_CONFIG와 동일한 옵션으로 삭제
	cookies.delete(AUTH_COOKIE_CONFIG.ACCESS_TOKEN.name, AUTH_COOKIE_CONFIG.ACCESS_TOKEN.options);
	cookies.delete(AUTH_COOKIE_CONFIG.REFRESH_TOKEN.name, AUTH_COOKIE_CONFIG.REFRESH_TOKEN.options);
	// 자동 로그인 플래그도 함께 정리한다. 남겨두면 다음 로그인에서 해제로 들어와도
	// 이전 선택이 살아 있어 지속 쿠키로 심긴다.
	cookies.delete(AUTO_LOGIN_COOKIE_CONFIG.name, AUTO_LOGIN_COOKIE_CONFIG.options);
	console.log('[Token Refresh] 토큰 쿠키 삭제됨');
}

/**
 * 토큰 갱신이 필요한지 확인
 * @param accessToken - 액세스 토큰
 * @param refreshToken - 리프레시 토큰
 * @returns 갱신 필요 여부와 상태 정보
 */
export function checkTokenStatus(accessToken?: string, refreshToken?: string) {
	// 액세스 토큰이 없고 리프레시 토큰도 없으면 인증 불가
	if (!accessToken) {
		if (refreshToken) {
			return { needsRefresh: true, status: 'needs_refresh' as const };
		}
		return { needsRefresh: false, status: 'no_access_token' as const };
	}

	// 액세스 토큰이 유효함
	if (!isTokenExpired(accessToken)) {
		return { needsRefresh: false, status: 'valid' as const };
	}

	// 액세스 토큰 만료, 리프레시 토큰 없음
	if (!refreshToken) {
		return { needsRefresh: false, status: 'no_refresh_token' as const };
	}

	// 액세스 토큰이 만료되었고 리프레시 토큰이 있으면 갱신 시도
	// (리프레시 토큰 만료 여부는 실제 API 호출에서 확인)
	return { needsRefresh: true, status: 'needs_refresh' as const };
}