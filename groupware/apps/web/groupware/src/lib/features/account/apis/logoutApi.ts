import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';

/**
 * 로그아웃: 같은 origin 의 BFF(/api/auth/logout)만 호출한다(쿠키 삭제)
 * 브라우저 전용 frontClient(공통 axios 인스턴스 + 인터셉터) 사용
 */
export async function logout(): Promise<void> {
  await frontClient().POST(ROUTES.AUTH.LOGOUT);
}
