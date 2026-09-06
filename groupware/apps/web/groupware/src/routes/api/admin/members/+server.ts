// 조직 사용자관리 BFF: user 서버 `/user-api/org/members*`(JWT 본인=슈퍼관리자) 로 중계
// 조직/역할(ROOT), 테넌트 격리는 user 서버가 토큰으로 강제한다. authUserClient 가 access 토큰 +
// X-Service-Token 을 자동 주입한다. 목록 조회는 SSR(+page.server.ts), 쓰기만 여기서 처리한다.
import type { RequestEvent } from '@sveltejs/kit';
import { authUserClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';
import type { MemberSummary } from '$lib/features/members/types';

/**
 * 409(중복) 공용 규칙: 조직 범위 중복은 이메일(로그인 ID)뿐이다.
 * 이름은 표시 이름이라 동명이인을 허용하므로 이름 중복 409 는 나오지 않는다(구 DUPLICATE_NAME 폐기)
 */
const duplicateRule = { errorCode: 'DUPLICATE_EMAIL', message: '이미 사용 중인 이메일입니다.' };

// 일반관리자(ADMIN) 추가. 이메일 중복은 409 → DUPLICATE_EMAIL.
export async function POST(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const body = await event.request.json();
    const res = await authUserClient(event).POST<MemberSummary>('/user-api/org/members', body);
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '관리자 추가에 실패했습니다.',
      log: 'Create member failed',
      table: {
        ...AUTH_ERROR_RULES,
        409: duplicateRule,
        400: { errorCode: 'INVALID_INPUT', message: '입력값을 확인하세요.' }
      }
    });
  }
}

// 일반관리자 수정: PATCH { id, name?, email?, departmentId?, phone?, extension?, password? }.
//  - name/email/departmentId/phone/extension 제공 시 이름/로그인이메일/소속/연락처 수정(/23)
//  - password 제공 시 비밀번호 재설정(/24, 잠금해제+세션 무효화)
// 변경분만 보낼 수 있다(MemberDetailPage 가 dirty 한 필드만 전송). phone/extension 은 빈문자/null=비움
export async function PATCH(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const body = await event.request.json();
    const { id, name, email, password } = body;
    const hasDepartment = 'departmentId' in body; // null=미배치 도 유효한 변경
    const hasPhone = 'phone' in body; // null/빈문자=비움 도 유효한 변경
    const hasExtension = 'extension' in body;
    if (
      typeof id !== 'number' ||
      (name === undefined &&
        email === undefined &&
        password === undefined &&
        !hasDepartment &&
        !hasPhone &&
        !hasExtension)
    ) {
      return fail('잘못된 요청입니다.', { status: 400 });
    }
    const client = authUserClient(event);
    // 이름 / 소속 부서 / 연락처는 같은 엔드포인트(/23)로: 변경분만 모아 1회 전송
    const memberPatch: {
      name?: string;
      email?: string;
      departmentId?: number | null;
      phone?: string | null;
      extension?: string | null;
    } = {};
    if (typeof name === 'string') memberPatch.name = name;
    // 이메일은 로그인 ID 라 공백을 흘리면 로그인 불가로 이어진다. 앞뒤 공백만 제거해 보낸다.
    //   (형식 검증은 user 서버 DTO 가 최종 판정)
    if (typeof email === 'string') memberPatch.email = email.trim();
    if (hasDepartment) memberPatch.departmentId = body.departmentId ?? null;
    if (hasPhone) memberPatch.phone = typeof body.phone === 'string' ? body.phone : null;
    if (hasExtension) memberPatch.extension = typeof body.extension === 'string' ? body.extension : null;
    if (Object.keys(memberPatch).length > 0) {
      await client.PATCH(`/user-api/org/members/${id}`, memberPatch);
    }
    if (typeof password === 'string') {
      await client.POST(`/user-api/org/members/${id}/reset-password`, { password });
    }
    return ok();
  } catch (error) {
    return mapHttpError(error, {
      fallback: '관리자 저장에 실패했습니다.',
      log: 'Update member failed',
      table: {
        ...AUTH_ERROR_RULES,
        409: duplicateRule,
        404: { message: '관리자를 찾을 수 없습니다.' },
        400: { message: '입력값을 확인하세요.' }
      }
    });
  }
}

// 일반관리자 삭제: DELETE { id }(soft). ROOT 대상/타조직은 백엔드에서 403/404 차단
export async function DELETE(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const { id } = await event.request.json();
    if (typeof id !== 'number') {
      return fail('잘못된 요청입니다.', { status: 400 });
    }
    await authUserClient(event).DELETE(`/user-api/org/members/${id}`);
    return ok();
  } catch (error) {
    return mapHttpError(error, {
      fallback: '관리자 삭제에 실패했습니다.',
      log: 'Delete member failed',
      table: {
        ...AUTH_ERROR_RULES,
        404: { message: '관리자를 찾을 수 없습니다.' }
      }
    });
  }
}
