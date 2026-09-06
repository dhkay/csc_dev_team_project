// 조직 ROOT 관리자 BFF: 조회(GET) + 이름 수정(PATCH) + 비밀번호 재설정(POST)
// csc-control-tower `/platform/organizations/:id/root-admin[/reset-password]` 로 중계
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
import { isPasswordValid } from '$lib/shared/lib/utils/passwordPolicy';
import { isEmailValid } from '$lib/shared/lib/utils/emailPolicy';
import type { RootAdminSummary } from '$lib/features/organizations/types';

/** root-admin 라우트 공통 에러 매핑 */
function mapError(error: unknown, fallback: string): Response {
  return mapHttpError(error, {
    fallback,
    log: 'Root-admin request failed',
    table: {
      ...AUTH_ERROR_RULES,
      404: { message: 'ROOT 관리자를 찾을 수 없습니다.' },
      409: { errorCode: 'DUPLICATE_EMAIL', message: '이미 사용 중인 이메일입니다.' },
      400: { message: '처리할 수 없는 조직이거나 입력값을 확인하세요.' }
    }
  });
}

/** ROOT 관리자 조회 */
export async function GET(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  const orgId = parseIdParam(event.params.orgId);
  if (orgId === null) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }

  try {
    const res = await authControlClient(event).GET<RootAdminSummary>(
      `/platform/organizations/${orgId}/root-admin`,
    );
    return ok(res.data);
  } catch (error) {
    return mapError(error, 'ROOT 관리자 조회에 실패했습니다.');
  }
}

/**
 * ROOT 관리자 프로필 수정: 이름은 표시 이름이라 중복 검사가 없고, 이메일은 로그인 ID 라
 * 이미 쓰는 계정이 있으면 409 다. 어느 쪽을 바꾸어도 세션은 무효화되지 않는다.
 */
export async function PATCH(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  const orgId = parseIdParam(event.params.orgId);
  if (orgId === null) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }

  try {
    const { name, email } = await event.request.json();
    if (name === undefined && email === undefined) {
      return fail('잘못된 요청입니다.', { status: 400 });
    }
    if (
      name !== undefined &&
      (typeof name !== 'string' || name.trim() === '' || name.trim().length > 100)
    ) {
      return fail('이름은 1자 이상 100자 이하로 입력하세요.', {
        status: 400,
        errorCode: 'INVALID_NAME'
      });
    }
    if (email !== undefined && (typeof email !== 'string' || !isEmailValid(email))) {
      return fail('올바른 이메일을 입력하세요.', { status: 400, errorCode: 'INVALID_EMAIL' });
    }
    const res = await authControlClient(event).PATCH<RootAdminSummary>(
      `/platform/organizations/${orgId}/root-admin`,
      {
        ...(name === undefined ? {} : { name: name.trim() }),
        ...(email === undefined ? {} : { email: email.trim() })
      },
    );
    return ok(res.data);
  } catch (error) {
    return mapError(error, 'ROOT 관리자 수정에 실패했습니다.');
  }
}

/** ROOT 관리자 비밀번호 재설정 */
export async function POST(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  const orgId = parseIdParam(event.params.orgId);
  if (orgId === null) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }

  try {
    const { password } = await event.request.json();
    if (typeof password !== 'string' || !isPasswordValid(password)) {
      return fail('비밀번호는 8자 이상이며 영문자, 숫자, 특수문자를 포함해야 합니다.', {
        status: 400,
        errorCode: 'INVALID_PASSWORD'
      });
    }
    await authControlClient(event).POST(
      `/platform/organizations/${orgId}/root-admin/reset-password`,
      { password },
    );
    return ok();
  } catch (error) {
    return mapError(error, '비밀번호 재설정에 실패했습니다.');
  }
}
