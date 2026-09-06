// 조직 멤버 목록 BFF: csc-control-tower `/platform/organizations/:id/members` 로 중계
// 루트 관리자를 다른 조직원에게 넘길 때 대상을 고르는 데 쓴다.
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
import type { OrgMemberSummary } from '$lib/features/organizations/types';

export async function GET(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;

  const orgId = parseIdParam(event.params.orgId);
  if (orgId === null) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }

  try {
    const res = await authControlClient(event).GET<OrgMemberSummary[]>(
      `/platform/organizations/${orgId}/members`
    );
    return ok(res.data ?? []);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '조직 멤버를 불러오지 못했습니다.',
      log: 'List organization members failed',
      table: {
        ...AUTH_ERROR_RULES,
        404: { message: '조직을 찾을 수 없습니다.' }
      }
    });
  }
}
