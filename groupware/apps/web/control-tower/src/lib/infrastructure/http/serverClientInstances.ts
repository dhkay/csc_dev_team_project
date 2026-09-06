/**
 * SSR 전용 API 클라이언트 (내부망 직접 통신, X-Service-Token 자동 주입)
 * +server.ts, +page.server.ts, hooks.server.ts 등 서버사이드에서만 import 가능
 *
 * - user 서버: 인증/계정 게이트키퍼 (로그인/갱신/내정보)
 * - csc-control-tower(control): 플랫폼 도메인(조직 관리). PlatformAdminGuard 보호라 access 토큰 필요
 */

import { createAxiosInstance, createApiClient } from './httpClient';
import { serviceTokenRequestInterceptor } from './interceptors/serviceTokenInterceptor';
import { applyCorrelationHeaders } from '@csc/net-utils';
import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';

const privateUserAxiosInstance = createAxiosInstance({
  baseURL: env.PRIVATE_USER_API_URL || 'http://localhost:3002/',
});

const privateControlAxiosInstance = createAxiosInstance({
  baseURL: env.PRIVATE_ADMIN_API_URL || 'http://localhost:3001/',
});

// file-upload(스토리지): presign/confirm 중계용(서비스토큰만, 사용자 토큰 불필요). dev 포트 8001.
const privateStorageAxiosInstance = createAxiosInstance({
  baseURL: env.PRIVATE_STORAGE_API_URL || 'http://localhost:8001/',
});

// csc-marketing: 공통 에셋 메타 CRUD 중계용(서비스토큰만, 사용자 토큰 불필요). dev 포트 3003.
const privateMarketingAxiosInstance = createAxiosInstance({
  baseURL: env.PRIVATE_MARKETING_API_URL || 'http://localhost:3003/',
});

// 보안 Layer 3: SSR(BFF) → 백엔드 요청에 X-Service-Token 자동 주입
// 상관관계(trace/request id) 전파: hooks.server.ts 가 깐 컨텍스트를 읽어 헤더로 싣는다.
[
  privateUserAxiosInstance,
  privateControlAxiosInstance,
  privateStorageAxiosInstance,
  privateMarketingAxiosInstance,
].forEach((instance) => {
  instance.interceptors.request.use(serviceTokenRequestInterceptor);
  instance.interceptors.request.use(applyCorrelationHeaders);
});

/** SSR 전용 비인증 클라이언트 (user 서버) */
export const serverUserClient = createApiClient(privateUserAxiosInstance);

/** SSR 전용 클라이언트 (file-upload: presign/confirm, 서비스토큰만) */
export const serverStorageClient = createApiClient(privateStorageAxiosInstance);

/** SSR 전용 클라이언트 (csc-marketing: 공통 에셋 메타 CRUD, 서비스토큰만) */
export const serverMarketingClient = createApiClient(privateMarketingAxiosInstance);

/** SSR 전용 인증 클라이언트 (토큰 자동 주입) */
export function authUserClient(event: RequestEvent) {
  const token = event.locals.accessToken;
  if (!token) {
    throw new Error('인증 토큰이 없습니다.');
  }
  return createApiClient(privateUserAxiosInstance, token)();
}

/** SSR 전용 인증 클라이언트 (csc-control-tower: 플랫폼 도메인) */
export function authControlClient(event: RequestEvent) {
  const token = event.locals.accessToken;
  if (!token) {
    throw new Error('인증 토큰이 없습니다.');
  }
  return createApiClient(privateControlAxiosInstance, token)();
}
