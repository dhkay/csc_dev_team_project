// 조직 루트 관리자 이양 BFF: csc-control-tower `/platform/organizations/:id/root-admin/transfer` 로 중계
// 기존 조직원(활성 일반관리자)을 루트로 올리고 기존 루트는 일반관리자로 내린다.
// 두 사람의 세션은 무효가 되어 다시 로그인해야 한다.
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
import type { RootAdminSummary } from '$lib/features/organizations/types';

export async function POST(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;

  const orgId = parseIdParam(event.params.orgId);
  if (orgId === null) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }

  try {
    const { userId } = await event.request.json();
    if (!Number.isInteger(userId) || userId <= 0) {
      return fail('대상을 선택하세요.', { status: 400, errorCode: 'INVALID_INPUT' });
    }
    const res = await authControlClient(event).POST<RootAdminSummary>(
      `/platform/organizations/${orgId}/root-admin/transfer`,
      { userId }
    );
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '루트 관리자 변경에 실패했습니다.',
      log: 'Transfer root admin failed',
      table: {
        ...AUTH_ERROR_RULES,
        404: { message: '조직 또는 루트 관리자를 찾을 수 없습니다.' },
        400: { message: '루트 관리자로 지정할 수 없는 대상입니다.' }
      }
    });
  }
}
