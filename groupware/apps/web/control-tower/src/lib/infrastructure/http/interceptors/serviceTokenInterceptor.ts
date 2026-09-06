import type { InternalAxiosRequestConfig } from 'axios';
import { createServiceToken } from '$lib/shared/lib/utils/serviceToken';

/**
 * 서버 간 인증용 X-Service-Token 자동 주입 인터셉터 (SSR 전용)
 * BFF → 백엔드 호출마다 HS256 서명 서비스 토큰을 헤더에 싣는다.
 *
 * 주의: createServiceToken() 은 `$env/dynamic/private` + node:crypto 에 의존하므로
 * 브라우저 번들로 들어가면 안 된다. serverClientInstances.ts 에서만 직접 import 하며
 * interceptors/index.ts 배럴에는 노출하지 않는다.
 */
export const serviceTokenRequestInterceptor = (
  config: InternalAxiosRequestConfig,
): InternalAxiosRequestConfig => {
  if (typeof window !== 'undefined') {
    return config;
  }

  config.headers = config.headers || {};
  if (!config.headers['X-Service-Token']) {
    config.headers['X-Service-Token'] = createServiceToken();
  }

  return config;
};
