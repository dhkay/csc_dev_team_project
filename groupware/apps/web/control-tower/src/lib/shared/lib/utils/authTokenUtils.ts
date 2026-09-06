import type { Cookies } from '@sveltejs/kit';
import { AUTH_COOKIE_CONFIG } from '$lib/app/config/cookies';

/** JWT 토큰 페이로드 인터페이스 */
export interface JwtPayload {
  exp?: number;
  iat?: number;
  sub?: string;
  [key: string]: unknown;
}

/**
 * JWT 페이로드 세그먼트(base64url)를 UTF-8 문자열로 디코드한다.
 * base64url(`-`/`_`, 패딩 없음)을 표준 base64 로 정규화한 뒤 TextDecoder 로 UTF-8 복원한다.
 * (브라우저, Node SSR 양쪽에서 동작)
 */
function decodeJwtSegment(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/** JWT 토큰 만료 여부 확인 */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(decodeJwtSegment(token.split('.')[1]));
    const currentTime = Math.floor(Date.now() / 1000);
    return !payload.exp || payload.exp < currentTime;
  } catch (error) {
    console.error('토큰 파싱 오류:', error);
    return true;
  }
}

/** JWT 토큰에서 페이로드 추출 */
export function getTokenPayload(token: string): JwtPayload | null {
  try {
    return JSON.parse(decodeJwtSegment(token.split('.')[1])) as JwtPayload;
  } catch (error) {
    console.error('토큰 페이로드 추출 실패:', error);
    return null;
  }
}

/** 쿠키에서 토큰들을 삭제 (설정 시와 동일 옵션) */
export function clearTokens(cookies: Cookies): void {
  cookies.delete(AUTH_COOKIE_CONFIG.ACCESS_TOKEN.name, AUTH_COOKIE_CONFIG.ACCESS_TOKEN.options);
  cookies.delete(AUTH_COOKIE_CONFIG.REFRESH_TOKEN.name, AUTH_COOKIE_CONFIG.REFRESH_TOKEN.options);
}

/** 토큰 갱신이 필요한지 확인 */
export function checkTokenStatus(accessToken?: string, refreshToken?: string) {
  if (!accessToken) {
    if (refreshToken) {
      return { needsRefresh: true, status: 'needs_refresh' as const };
    }
    return { needsRefresh: false, status: 'no_access_token' as const };
  }

  if (!isTokenExpired(accessToken)) {
    return { needsRefresh: false, status: 'valid' as const };
  }

  if (!refreshToken) {
    return { needsRefresh: false, status: 'no_refresh_token' as const };
  }

  return { needsRefresh: true, status: 'needs_refresh' as const };
}
