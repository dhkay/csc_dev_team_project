import type { InternalAxiosRequestConfig } from 'axios';

/**
 * Authorization 헤더를 자동으로 추가하는 요청 인터셉터
 * 글로벌 상태 대신 요청별 토큰을 사용하여 동시 요청 안전성 보장
 */
export const authRequestInterceptor = (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
  // 이미 Authorization 헤더가 있으면 스킵
  if (config.headers?.Authorization) {
    return config;
  }

  // 요청별로 전달된 토큰 사용 (안전함)
  const token = config.__authToken;

  if (token && typeof window === 'undefined') {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;

    // 토큰을 config에서 제거 (보안)
    delete config.__authToken;

    if (import.meta.env.DEV) {
      console.log('[Auth] 요청별 토큰 자동 주입됨');
    }
  }

  return config;
};