import type { AxiosError } from 'axios';
import { ApiErrorHandler } from '../httpError';
import { ROUTES } from '../apiRoutes';

/**
 * API 응답 에러 처리 인터셉터
 * 401(인증 만료) 시 브라우저에서 로그아웃 후 /login 으로 이동한다(서버에선 동작 안 함)
 */
export const responseErrorInterceptor = async (error: AxiosError) => {
  if (import.meta.env.DEV) {
    console.error('[ErrorInterceptor] Axios 에러:', {
      message: error.message,
      status: error.response?.status,
      url: error.config?.url,
      method: error.config?.method,
    });
  }

  if (error.response?.status === 401) {
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      try {
        await fetch(ROUTES.AUTH.LOGOUT, { method: 'POST' });
      } catch (logoutError) {
        console.error('로그아웃 처리 중 오류:', logoutError);
      } finally {
        window.location.href = '/login';
      }
    }
  }

  if (error.response?.status === 403) {
    console.warn('접근 권한이 없습니다.');
  }

  return Promise.reject(ApiErrorHandler.handle(error));
};
