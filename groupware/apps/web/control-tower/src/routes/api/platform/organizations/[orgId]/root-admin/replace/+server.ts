// 조직 루트 관리자 교체 BFF: csc-control-tower `/platform/organizations/:id/root-admin/replace` 로 중계
// 조직에 계정이 없는 사람을 루트로 세운다(계정 신규 생성). 기존 루트는 일반관리자로 내려가고 계정은 남는다.
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
import { isEmailValid } from '$lib/shared/lib/utils/emailPolicy';
import { isPasswordValid } from '$lib/shared/lib/utils/passwordPolicy';
import type { RootAdminSummary } from '$lib/features/organizations/types';

export async function POST(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;

  const orgId = parseIdParam(event.params.orgId);
  if (orgId === null) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }

  try {
    const { email, name, password } = await event.request.json();
    if (typeof email !== 'string' || !isEmailValid(email)) {
      return fail('올바른 이메일을 입력하세요.', { status: 400, errorCode: 'INVALID_EMAIL' });
    }
    if (typeof name !== 'string' || name.trim() === '' || name.trim().length > 100) {
      return fail('이름은 1자 이상 100자 이하로 입력하세요.', {
        status: 400,
        errorCode: 'INVALID_NAME'
      });
    }
    if (typeof password !== 'string' || !isPasswordValid(password)) {
      return fail('비밀번호는 8자 이상이며 영문자, 숫자, 특수문자를 포함해야 합니다.', {
        status: 400,
        errorCode: 'INVALID_PASSWORD'
      });
    }
    const res = await authControlClient(event).POST<RootAdminSummary>(
      `/platform/organizations/${orgId}/root-admin/replace`,
      { email: email.trim(), name: name.trim(), password }
    );
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '루트 관리자 추가에 실패했습니다.',
      log: 'Replace root admin failed',
      table: {
        ...AUTH_ERROR_RULES,
        404: { message: '조직 또는 루트 관리자를 찾을 수 없습니다.' },
        409: { errorCode: 'DUPLICATE_EMAIL', message: '이미 사용 중인 이메일입니다.' },
        400: { message: '입력값을 확인하세요.' }
      }
    });
  }
}
