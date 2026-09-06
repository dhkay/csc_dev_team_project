import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios';

/** 개발 환경에서 API 요청/응답을 간단히 로깅한다. */
export const devLoggingInterceptor = {
  request: (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    console.log(`[API 요청] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  response: (response: AxiosResponse): AxiosResponse => {
    console.log(
      `[API 응답] ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`,
    );
    return response;
  },
};
