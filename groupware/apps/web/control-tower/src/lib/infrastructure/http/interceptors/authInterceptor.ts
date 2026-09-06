import type { InternalAxiosRequestConfig } from 'axios';

/**
 * 요청별 토큰을 Authorization 헤더로 주입하는 요청 인터셉터(SSR 전용)
 * 글로벌 상태 대신 요청별 `__authToken` 을 사용해 동시 요청 안전성을 보장한다.
 */
export const authRequestInterceptor = (
  config: InternalAxiosRequestConfig,
): InternalAxiosRequestConfig => {
  if (config.headers?.Authorization) {
    return config;
  }

  const token = config.__authToken;

  if (token && typeof window === 'undefined') {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
    delete config.__authToken;
  }

  return config;
};
