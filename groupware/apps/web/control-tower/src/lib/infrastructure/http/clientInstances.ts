import { createAxiosInstance, createApiClient } from './httpClient';

/**
 * 브라우저 전용 API 클라이언트 (같은 origin BFF `/api/...` 호출)
 *
 * Svelte 컴포넌트, features/apis/ 등 클라이언트 사이드에서 사용
 * 서버사이드(+server.ts, +page.server.ts, hooks)는 serverClientInstances.ts 의 server/auth 클라이언트 사용
 */
const frontAxiosInstance = createAxiosInstance({ baseURL: '' });

/** 브라우저 전용 클라이언트: 같은 origin BFF. 토큰은 HttpOnly 쿠키로 자동 전송 */
export const frontClient = createApiClient(frontAxiosInstance);
