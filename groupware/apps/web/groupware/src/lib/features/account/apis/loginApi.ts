import type { LoginRequest, LoginResult } from '$lib/shared/types/common.types';
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';

/**
 * 이메일 로그인: 같은 origin 의 BFF(/api/auth/login)만 호출한다.
 * 브라우저 전용 frontClient(공통 axios 인스턴스 + 인터셉터) 사용
 * 로그인 BFF 는 실패해도 200 + { success:false } 로 응답하므로 에러 인터셉터가 가로채지 않는다.
 */
export async function login(payload: LoginRequest): Promise<LoginResult> {
  const res = await frontClient().POST<LoginResult, LoginRequest>(ROUTES.AUTH.LOGIN, payload);
  return res.data;
}
