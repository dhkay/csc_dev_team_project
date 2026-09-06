import type { AxiosError } from 'axios';
import { ApiErrorHandler, isCanceledError } from '../httpError';
import { ROUTES } from '../apiRoutes';


/**
 * API 응답 에러를 처리하는 인터셉터입니다.
 * 인증 오류와 권한 오류에 대한 기본적인 처리를 수행합니다.
 */
export const responseErrorInterceptor = async (error: AxiosError) => {
	// 취소는 오류가 아니다. 부른 쪽이 끊었다(배치 삭제, 생성 취소). 로그도 인증 처리도 없이
	//   봉투만 바꿔 넘긴다. 로그로 남기면 취소마다 콘솔에 에러가 쌓여 실제 실패가 묻힌다.
	if (isCanceledError(error)) {
		return Promise.reject(ApiErrorHandler.handle(error));
	}

	// 원본 axios 에러 상세 로깅 (디버깅용)
	if (import.meta.env.DEV) {
		console.error('[ErrorInterceptor] 원본 Axios 에러:', {
			message: error.message,
			status: error.response?.status,
			statusText: error.response?.statusText,
			data: error.response?.data,
			url: error.config?.url,
			method: error.config?.method,
			requestData: error.config?.data,
		});
	}

	// 401 Unauthorized - 인증 만료 또는 실패
	if (error.response?.status === 401) {
		console.warn('인증이 만료되었습니다. 로그아웃 후 로그인 페이지로 이동합니다.');

		// 브라우저 환경에서만 처리
		if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
			try {
				// 로그아웃 API 호출하여 쿠키 삭제
				await fetch(ROUTES.AUTH.LOGOUT, { method: 'POST' });
			} catch (logoutError) {
				console.error('로그아웃 처리 중 오류:', logoutError);
			} finally {
				// 로그인 페이지로 리다이렉트
				window.location.href = '/login';
			}
		}
	}

	// 403 Forbidden - 권한 없음
	if (error.response?.status === 403) {
		console.warn('접근 권한이 없습니다.');
	}

	// 통합 에러 처리
	return Promise.reject(ApiErrorHandler.handle(error));
};