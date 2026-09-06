import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';

import {
  authRequestInterceptor,
  responseErrorInterceptor,
  devLoggingInterceptor
} from './interceptors';

export interface ApiClientConfig {
  baseURL: string;
  withCredentials?: boolean;
  isFileUpload?: boolean;  // 파일 업로드 서버 여부
}

/**
 * Axios 인스턴스를 생성하고 인터셉터를 설정합니다.
 */
export function createAxiosInstance(config: ApiClientConfig): AxiosInstance {
  const instance = axios.create({
    baseURL: config.baseURL,
    headers: config.isFileUpload
      ? {} // 파일 업로드는 Content-Type을 자동으로 설정 (multipart/form-data)
      : { 'Content-Type': 'application/json' },
    withCredentials: config.withCredentials ?? true
  });

  // 인증 토큰 자동 주입 인터셉터
  instance.interceptors.request.use(authRequestInterceptor);

  // 개발 환경에서만 요청/응답 로깅
  if (import.meta.env.DEV) {
    instance.interceptors.request.use(devLoggingInterceptor.request);
    instance.interceptors.response.use(devLoggingInterceptor.response);
  }

  // 에러 응답 처리
  instance.interceptors.response.use(
    (response) => response,
    responseErrorInterceptor
  );

  return instance;
}

/**
 * API 클라이언트를 생성하는 팩토리 함수입니다.
 * 토큰이 제공되면 자동으로 Authorization 헤더를 추가합니다.
 */
export function createApiClient(axiosInstance: AxiosInstance, token?: string | null) {
  return (basePath: string = '') => {
    const normalizedPath = basePath ? (basePath.startsWith('/') ? basePath : `/${basePath}`) : '';

    // 토큰을 요청 config에 안전하게 주입하는 헬퍼
    const injectToken = (config: AxiosRequestConfig = {}): AxiosRequestConfig => {
      if (token && !config.headers?.Authorization) {
        config.__authToken = token;
      }
      return config;
    };

    return {
      GET: async <T>(url: string, config?: AxiosRequestConfig) =>
        axiosInstance.get<T>(`${normalizedPath}${url}`, injectToken(config)),

      POST: async <T, D = any>(url: string, data?: D, config?: AxiosRequestConfig) =>
        axiosInstance.post<T>(`${normalizedPath}${url}`, data, injectToken(config)),

      DELETE: async <T, D = any>(url: string, data?: D, config?: AxiosRequestConfig) =>
        axiosInstance.delete<T>(`${normalizedPath}${url}`, { ...injectToken(config), data }),

      PATCH: async <T, D = any>(url: string, data?: D, config?: AxiosRequestConfig) =>
        axiosInstance.patch<T>(`${normalizedPath}${url}`, data, injectToken(config)),

      PUT: async <T, D = any>(url: string, data?: D, config?: AxiosRequestConfig) =>
        axiosInstance.put<T>(`${normalizedPath}${url}`, data, injectToken(config))
    };
  };
}