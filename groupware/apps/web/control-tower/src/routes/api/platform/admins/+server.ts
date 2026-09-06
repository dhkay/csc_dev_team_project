// 플랫폼 관리자 관리 BFF: csc-control-tower `/platform/admins*`(ROOT 전용) 로 중계
// PlatformRootGuard(access 토큰) + ServiceTokenGuard 보호라 authControlClient 가 둘 다 첨부한다.
// 쓰기(생성/삭제/옵션설정)만 여기서 처리한다(목록/카탈로그/단건 옵션은 SSR server load)
import type { RequestEvent } from '@sveltejs/kit';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';
import type { AdminSummary } from '$lib/features/admins/types';

// 관리자(ADMIN) 추가 (+초기 옵션). 이메일 중복은 409 → DUPLICATE_EMAIL.
export async function POST(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const body = await event.request.json();
    const res = await authControlClient(event).POST<AdminSummary>('/platform/admins', body);
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '관리자 추가에 실패했습니다.',
      log: 'Create admin failed',
      table: {
        ...AUTH_ERROR_RULES,
        409: { errorCode: 'DUPLICATE_EMAIL', message: '이미 사용 중인 이메일입니다.' },
        400: { errorCode: 'INVALID_INPUT', message: '입력값을 확인하세요.' }
      }
    });
  }
}

// 관리자 수정: PATCH { id, name?, email?, features? }.
//  - name/email 제공 시 프로필 수정(/platform/admins/:id): 한 번의 호출로 함께 반영한다.
//  - features 제공 시 옵션 일괄 설정(/platform/admins/:id/features). ROOT 옵션은 변경 대상 아님
// 변경분만 보낼 수 있다(AdminDetailPage 가 dirty 한 필드만 전송)
export async function PATCH(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const { id, name, email, features } = await event.request.json();
    if (
      typeof id !== 'number' ||
      (name === undefined && email === undefined && features === undefined)
    ) {
      return fail('잘못된 요청입니다.', { status: 400 });
    }
    const client = authControlClient(event);
    const profile = {
      ...(typeof name === 'string' ? { name } : {}),
      ...(typeof email === 'string' ? { email } : {})
    };
    if (Object.keys(profile).length > 0) {
      await client.PATCH(`/platform/admins/${id}`, profile);
    }
    if (Array.isArray(features)) {
      await client.PATCH(`/platform/admins/${id}/features`, { features });
    }
    return ok();
  } catch (error) {
    return mapHttpError(error, {
      fallback: '관리자 저장에 실패했습니다.',
      log: 'Update admin failed',
      table: {
        ...AUTH_ERROR_RULES,
        404: { message: '관리자를 찾을 수 없습니다.' },
        409: { errorCode: 'DUPLICATE_EMAIL', message: '이미 사용 중인 이메일입니다.' },
        // 루트 이메일 변경 거부 등 백엔드가 이유를 담아 주면 그대로 보여준다.
        400: (e) => ({ message: e.message || '입력값을 확인하세요.' })
      }
    });
  }
}

// 관리자 삭제: DELETE { id }. ROOT 삭제는 백엔드에서 400 차단
export async function DELETE(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const { id } = await event.request.json();
    if (typeof id !== 'number') {
      return fail('잘못된 요청입니다.', { status: 400 });
    }
    await authControlClient(event).DELETE(`/platform/admins/${id}`);
    return ok();
  } catch (error) {
    return mapHttpError(error, {
      fallback: '관리자 삭제에 실패했습니다.',
      log: 'Delete admin failed',
      table: {
        ...AUTH_ERROR_RULES,
        404: { message: '관리자를 찾을 수 없습니다.' },
        400: { message: '삭제할 수 없는 관리자입니다.' }
      }
    });
  }
}
