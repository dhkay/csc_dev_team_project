// 조직 복구 BFF: WITHDRAWN → ACTIVE. csc-control-tower `/platform/organizations/:id/recover` 로 중계
// PlatformAdminGuard(access 토큰) + ServiceTokenGuard 보호라 authControlClient 가 둘 다 첨부한다.
import type { RequestEvent } from '@sveltejs/kit';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import {
  AUTH_ERROR_RULES,
  ok,
  fail,
  mapHttpError,
  parseIdParam,
  requireAuth
} from '$lib/server/http/bff';

/** 조직 복구: 소프트 삭제(WITHDRAWN) 되돌리기 */
export async function POST(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  const orgId = parseIdParam(event.params.orgId);
  if (orgId === null) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }

  try {
    const res = await authControlClient(event).POST(
      `/platform/organizations/${orgId}/recover`,
    );
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '조직 복구에 실패했습니다.',
      log: 'Recover organization failed',
      table: {
        ...AUTH_ERROR_RULES,
        404: { message: '조직을 찾을 수 없습니다.' },
        400: { message: '복구할 수 없는 조직입니다.' }
      }
    });
  }
}
