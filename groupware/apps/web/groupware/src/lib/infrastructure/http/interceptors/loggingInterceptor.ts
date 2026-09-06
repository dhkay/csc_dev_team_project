import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios';

/**
 * 개발 환경에서 API 요청과 응답을 간단히 로깅하는 인터셉터입니다.
 */
export const devLoggingInterceptor = {
  // 요청 로깅 인터셉터
  request: (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    console.log(`[API 요청] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },

  // 응답 로깅 인터셉터
  response: (response: AxiosResponse): AxiosResponse => {
    console.log(`[API 응답] ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
    return response;
  }
};