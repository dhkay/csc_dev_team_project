/** dev 환경에서만 false, staging/prod(HTTPS)에서는 true */
const isSecure = process.env.NODE_ENV !== 'development';

export const AUTH_COOKIE_CONFIG = {
	ACCESS_TOKEN: {
		name: 'access_token',
		options: {
			path: '/',
			httpOnly: true,
			secure: isSecure,
			sameSite: 'lax' as const,
			maxAge: 60 * 60 * 24, // 1일
		},
	},
	REFRESH_TOKEN: {
		name: 'refresh_token',
		options: {
			path: '/',
			httpOnly: true,
			secure: isSecure,
			sameSite: 'lax' as const,
			maxAge: 60 * 60 * 24 * 10, // 10일
		},
	},
} as const;

/**
 * 자동 로그인 선택 여부
 *
 * 인증 쿠키를 지속 쿠키로 심을지(선택) 브라우저 세션 쿠키로 심을지(해제)를 가른다.
 * hooks 의 토큰 갱신이 같은 모드로 다시 심어야 하는데, 요청에서는 기존 쿠키의 수명을
 * 알 수 없으므로 선택값 자체를 서버가 읽는 쿠키로 남긴다.
 */
export const AUTO_LOGIN_COOKIE_CONFIG = {
	name: 'auto_login',
	options: {
		path: '/',
		httpOnly: true,
		secure: isSecure,
		sameSite: 'lax' as const,
		// 리프레시 쿠키와 같은 수명. 갱신 때 함께 다시 심어 두 쿠키가 어긋나지 않게 한다.
		maxAge: 60 * 60 * 24 * 10, // 10일
	},
} as const;

/**
 * 인증 쿠키(access\refresh) 옵션. 자동 로그인이 아니면 maxAge 를 빼서 브라우저 세션 쿠키로
 * 만든다(브라우저를 완전히 닫으면 사라진다). 만료 자체는 서버가 발급한 JWT 가 계속 통제하므로,
 * 세션 쿠키라도 유효기간이 무한해지지는 않는다.
 */
export function authCookieOptions(
	config: typeof AUTH_COOKIE_CONFIG.ACCESS_TOKEN | typeof AUTH_COOKIE_CONFIG.REFRESH_TOKEN,
	autoLogin: boolean,
) {
	const { path, httpOnly, secure, sameSite, maxAge } = config.options;
	return autoLogin
		? { path, httpOnly, secure, sameSite, maxAge }
		: { path, httpOnly, secure, sameSite };
}
