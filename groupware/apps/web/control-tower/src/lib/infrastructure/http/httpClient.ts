import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';

import {
  authRequestInterceptor,
  responseErrorInterceptor,
  devLoggingInterceptor,
} from './interceptors';

export interface ApiClientConfig {
  baseURL: string;
  withCredentials?: boolean;
}

/** Axios 인스턴스를 생성하고 인터셉터를 설정한다. */
export function createAxiosInstance(config: ApiClientConfig): AxiosInstance {
  const instance = axios.create({
    baseURL: config.baseURL,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: config.withCredentials ?? true,
  });

  instance.interceptors.request.use(authRequestInterceptor);

  if (import.meta.env.DEV) {
    instance.interceptors.request.use(devLoggingInterceptor.request);
    instance.interceptors.response.use(devLoggingInterceptor.response);
  }

  instance.interceptors.response.use((response) => response, responseErrorInterceptor);

  return instance;
}

/**
 * API 클라이언트 팩토리. 토큰이 제공되면 요청별로 Authorization 헤더를 주입한다.
 */
export function createApiClient(axiosInstance: AxiosInstance, token?: string | null) {
  return (basePath: string = '') => {
    const normalizedPath = basePath ? (basePath.startsWith('/') ? basePath : `/${basePath}`) : '';

    const injectToken = (config: AxiosRequestConfig = {}): AxiosRequestConfig => {
      if (token && !config.headers?.Authorization) {
        config.__authToken = token;
      }
      return config;
    };

    return {
      GET: async <T>(url: string, config?: AxiosRequestConfig) =>
        axiosInstance.get<T>(`${normalizedPath}${url}`, injectToken(config)),

      POST: async <T, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig) =>
        axiosInstance.post<T>(`${normalizedPath}${url}`, data, injectToken(config)),

      DELETE: async <T, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig) =>
        axiosInstance.delete<T>(`${normalizedPath}${url}`, { ...injectToken(config), data }),

      PATCH: async <T, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig) =>
        axiosInstance.patch<T>(`${normalizedPath}${url}`, data, injectToken(config)),

      PUT: async <T, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig) =>
        axiosInstance.put<T>(`${normalizedPath}${url}`, data, injectToken(config)),
    };
  };
}
