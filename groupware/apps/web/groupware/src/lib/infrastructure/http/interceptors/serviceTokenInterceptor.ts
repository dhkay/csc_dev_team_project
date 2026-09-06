import type { InternalAxiosRequestConfig } from 'axios';
import { createServiceToken } from '$lib/shared/lib/utils/serviceToken';

/**
 * 서버 간 인증용 X-Service-Token 자동 주입 인터셉터 (SSR 전용)
 *
 * 보안 아키텍처 Layer 3(Service Token)을 충족한다. BFF → 백엔드 호출마다
 * HS256 서명된 서비스 토큰을 헤더에 실어 보내고, 백엔드 Guard/Middleware가 검증한다.
 *
 * 주의: createServiceToken() 은 `$env/dynamic/private` + node:crypto 에 의존하므로
 * 절대 브라우저 번들로 들어가면 안 된다. 이 모듈은 serverClientInstances.ts 에서만
 * 직접 import 하며, interceptors/index.ts 배럴에는 노출하지 않는다.
 * (배럴은 httpClient → clientInstances 경로로 클라이언트 번들에 포함되기 때문)
 */
export const serviceTokenRequestInterceptor = (
  config: InternalAxiosRequestConfig,
): InternalAxiosRequestConfig => {
  // 이중 안전장치: 어떤 이유로든 브라우저에서 실행되면 토큰을 붙이지 않는다.
  if (typeof window !== 'undefined') {
    return config;
  }

  config.headers = config.headers || {};
  if (!config.headers['X-Service-Token']) {
    config.headers['X-Service-Token'] = createServiceToken();
  }

  return config;
};
