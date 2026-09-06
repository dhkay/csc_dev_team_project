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
