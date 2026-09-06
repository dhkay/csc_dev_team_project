// 플랫폼 관리 BFF 게이트: 인증 + 특정 관리 옵션(adminFeature) 보유 확인
//   백엔드(csc-marketing)는 서비스토큰만 검증하므로 플랫폼 관리자 인가는 이 BFF 층이 책임진다.
import type { RequestEvent } from '@sveltejs/kit';
import { fail, requireAuth } from '$lib/server/http/bff';
import { hasAdminFeature } from '$lib/shared/lib/auth/platform';

/**
 * 플랫폼 관리자 + 관리 옵션 게이트. 통과면 null, 아니면 에러 Response.
 * `const gateErr = await requireAdminFeature(event, 'ai-tools-management'); if (gateErr) return gateErr;`
 */
export async function requireAdminFeature(
  event: RequestEvent,
  featureKey: string,
): Promise<Response | null> {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  const user = await event.locals.getUser();
  if (!hasAdminFeature(user, featureKey)) {
    return fail('권한이 없습니다.', { status: 403 });
  }
  return null;
}
