/**
 * SSR 전용 API 클라이언트 (Docker 내부 URL)
 *
 * +server.ts, +page.server.ts 등 서버사이드에서만 import 가능
 * PRIVATE_* 환경변수로 Docker 내부 네트워크 직접 통신:
 *   - Cloudflare/Nginx 경유 불필요 → 응답 속도 향상
 *   - IP 제한(admin-api 등) 우회 → 302 리다이렉트 방지
 *
 * 개발 환경(로컬)에서는 PRIVATE_* 미설정 시 PUBLIC_VITE_* 폴백
 */

import { createAxiosInstance, createApiClient } from './httpClient';
import { serviceTokenRequestInterceptor } from './interceptors/serviceTokenInterceptor';
import { applyCorrelationHeaders } from '@csc/net-utils';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';

/** SSR 전용 Axios 인스턴스 (PRIVATE URL → PUBLIC URL 폴백) */
const privateMainAxiosInstance = createAxiosInstance({
  baseURL: privateEnv.PRIVATE_API_URL || env.PUBLIC_VITE_API_URL || 'http://localhost:3000/'
});

const privateUserAxiosInstance = createAxiosInstance({
  baseURL: privateEnv.PRIVATE_USER_API_URL || env.PUBLIC_VITE_USER_API_URL || 'http://localhost:3002/'
});

const privateStorageAxiosInstance = createAxiosInstance({
  // dev 폴백 = file-upload dev 포트(8001). control-tower .env / file-upload PUBLIC_UPLOAD_BASE_URL 와 동일
  baseURL: privateEnv.PRIVATE_STORAGE_API_URL || env.PUBLIC_VITE_FILE_UPLOAD_API_URL || 'http://localhost:8001/',
  isFileUpload: true
});

const privateMarketingAxiosInstance = createAxiosInstance({
  // csc-marketing(NestJS 마케팅 도메인 서버). dev 폴백 = 3003.
  // 서비스토큰만으로 호출: 조직 스코프는 BFF 가 organizationId 로 명시 전달
  baseURL: privateEnv.PRIVATE_MARKETING_API_URL || 'http://localhost:3003/'
});

const privateLanguageModelAxiosInstance = createAxiosInstance({
  // language-model(FastAPI, 재사용 LLM 역량: 챗봇 세션 CRUD). dev 폴백 = 8010(language-model `pnpm dev` 포트)
  // 신원(org/user)은 BFF 가 X-Organization-Id/X-User-Id 헤더로 명시 전달(요청별)
  // 스트리밍(SSE)은 이 axios 인스턴스가 아니라 fetch 로 직접 프록시한다(stream/+server.ts)
  baseURL: privateEnv.PRIVATE_LANGUAGE_MODEL_API_URL || 'http://localhost:8010/'
});

const privateLogServerAxiosInstance = createAxiosInstance({
  // log-server(FastAPI, 통합 로그 수집/조회). 조회 전용으로만 쓴다. 로그 적재는 백엔드
  // (csc-marketing)가 직접 보낸다(BFF 경유 없음). 조직 스코프는 BFF 가 organizationId +
  // all_orgs:false 로 명시 전달(서비스토큰 인증)
  //
  // dev 폴백이 다른 서버들과 달리 `pnpm dev` 포트(8020)가 아니라 dev compose 호스트 포트(6015)
  // 인 이유: dev compose 는 kafka 를 호스트로 노출하지 않아서, log-server 를 호스트에서 직접
  // 띄우면 로그를 발행할 수 없다. 즉 dev 에서 유효한 구동 방식은 Docker 뿐이라 그 포트를 가리킨다.
  // (호스트 직접 구동 등 다른 토폴로지는 PRIVATE_LOG_SERVER_API_URL 로 덮어쓴다.)
  baseURL: privateEnv.PRIVATE_LOG_SERVER_API_URL || 'http://localhost:6015/'
});

// 보안 Layer 3: 모든 SSR(BFF) → 백엔드 요청에 X-Service-Token 자동 주입
// 브라우저 전용 clientInstances 에는 적용하지 않는다(서비스 토큰은 서버 시크릿 기반)
[
  privateMainAxiosInstance,
  privateUserAxiosInstance,
  privateStorageAxiosInstance,
  privateMarketingAxiosInstance,
  privateLanguageModelAxiosInstance,
  privateLogServerAxiosInstance,
].forEach((instance) => {
  instance.interceptors.request.use(serviceTokenRequestInterceptor);
  // 상관관계(trace/request id) 전파: hooks.server.ts 가 깐 컨텍스트를 읽어 헤더로 싣는다.
  instance.interceptors.request.use(applyCorrelationHeaders);
});

/** SSR 전용 비인증 클라이언트 */
export const serverMainClient = createApiClient(privateMainAxiosInstance);
export const serverUserClient = createApiClient(privateUserAxiosInstance);
export const serverStorageClient = createApiClient(privateStorageAxiosInstance);
// csc-marketing(NestJS). 조직 스코프는 BFF 가 organizationId 로 전달(서비스토큰 인증)
export const serverMarketingClient = createApiClient(privateMarketingAxiosInstance);
// language-model(FastAPI). 신원(org/user)은 BFF 가 X-Organization-Id/X-User-Id 헤더로 전달(서비스토큰 인증)
export const serverLanguageModelClient = createApiClient(privateLanguageModelAxiosInstance);
// log-server(FastAPI). 조회 전용: 조직 스코프는 BFF 가 organizationId + all_orgs:false 로 전달
export const serverLogClient = createApiClient(privateLogServerAxiosInstance);

/** 로그인 직후처럼 locals 에 아직 토큰이 없는 SSR/BFF 흐름에서 사용한다. */
export function tokenUserClient(token: string) {
  return createApiClient(privateUserAxiosInstance, token)();
}

/** SSR 전용 인증 클라이언트 (토큰 자동 주입) */
export function authMainClient(event: RequestEvent) {
  const token = event.locals.accessToken;
  if (!token) {
    throw new Error('인증 토큰이 없습니다.');
  }
  return createApiClient(privateMainAxiosInstance, token)();
}

export function authUserClient(event: RequestEvent) {
  const token = event.locals.accessToken;
  if (!token) {
    throw new Error('인증 토큰이 없습니다.');
  }
  return createApiClient(privateUserAxiosInstance, token)();
}
