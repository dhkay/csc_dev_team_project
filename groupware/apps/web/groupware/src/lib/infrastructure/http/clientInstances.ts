import { createAxiosInstance, createApiClient } from './httpClient';

/**
 * 브라우저 전용 API 클라이언트
 *
 * baseURL 이 빈 문자열인 이유: 브라우저는 자기 web 서버의 `/api/...`(BFF)만 호출한다.
 * 백엔드를 직접 가리키는 클라이언트는 두지 않는다. 그런 호출은 서비스토큰을 실을 수 없고
 * CORS 와 IP 제한에 걸리며, 토큰 주입 지점이 브라우저로 새어 나온다.
 *
 * 서버사이드(+server.ts, +page.server.ts)는 serverClientInstances.ts 를 쓴다.
 */
const frontAxiosInstance = createAxiosInstance({
  baseURL: ''
});

/** 같은 origin BFF 호출용 클라이언트 */
export const frontClient = createApiClient(frontAxiosInstance);
