// 조직 ROOT 관리자 이메일 중복 확인 BFF: csc-control-tower
// `/platform/organizations/:id/root-admin/email-available` 로 중계
// 조직유저 이메일은 로그인 ID 라 전체에서 유일하다. 저장 시점의 중복 검증(409)을 대체하지 않는다.
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
import type { RootAdminEmailAvailability } from '$lib/features/organizations/types';

export async function GET(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;

  const orgId = parseIdParam(event.params.orgId);
  if (orgId === null) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }
  const email = event.url.searchParams.get('email')?.trim() ?? '';
  if (!email) {
    return fail('이메일을 입력하세요.', { status: 400, errorCode: 'INVALID_INPUT' });
  }

  try {
    const query = new URLSearchParams({ email });
    const res = await authControlClient(event).GET<RootAdminEmailAvailability>(
      `/platform/organizations/${orgId}/root-admin/email-available?${query.toString()}`
    );
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '이메일 확인에 실패했습니다.',
      log: 'Check root-admin email failed',
      table: {
        ...AUTH_ERROR_RULES,
        404: { message: 'ROOT 관리자를 찾을 수 없습니다.' },
        400: { errorCode: 'INVALID_INPUT', message: '이메일 형식을 확인하세요.' }
      }
    });
  }
}
