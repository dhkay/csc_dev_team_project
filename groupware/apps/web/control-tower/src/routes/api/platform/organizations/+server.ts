// 조직 생성/수정/삭제 BFF: csc-control-tower `/platform/organizations*` 로 중계
// PlatformAdminGuard(access 토큰) + ServiceTokenGuard 보호라 authControlClient 가 둘 다 첨부한다.
import type { RequestEvent } from '@sveltejs/kit';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

interface CreatedCompany {
  organization: { id: number; slug: string; name: string; type: string };
  rootAdmin: { id: number; email: string; name: string };
}

// 조직 + ROOT 동시 생성
// 409 는 두 가지다: slug 중복과 루트 이메일 중복. 백엔드가 실어 보낸 code 로 갈라야
// 화면이 맞는 입력란에 오류를 붙인다(둘 다 SLUG_TAKEN 으로 뭉치면 멀쩡한 slug 를 고치게 된다)
export async function POST(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const body = await event.request.json();
    const res = await authControlClient(event).POST<CreatedCompany>('/platform/organizations', body);
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '조직 생성에 실패했습니다.',
      log: 'Create organization failed',
      table: {
        ...AUTH_ERROR_RULES,
        409: (e) =>
          (e.response?.data as { code?: string } | undefined)?.code === 'ROOT_EMAIL_TAKEN'
            ? { errorCode: 'DUPLICATE_EMAIL', message: '이미 사용 중인 이메일입니다.' }
            : { errorCode: 'SLUG_TAKEN', message: '이미 사용 중인 slug 입니다.' },
        400: { errorCode: 'INVALID_INPUT', message: '입력값을 확인하세요.' }
      }
    });
  }
}

// 조직 수정: 이름/slug/상태. csc-control-tower PATCH 로 중계
export async function PATCH(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const { id, ...patch } = await event.request.json();
    if (typeof id !== 'number') {
      return fail('잘못된 요청입니다.', { status: 400 });
    }
    const res = await authControlClient(event).PATCH(`/platform/organizations/${id}`, patch);
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '조직 수정에 실패했습니다.',
      log: 'Update organization failed',
      table: {
        ...AUTH_ERROR_RULES,
        409: { errorCode: 'SLUG_TAKEN', message: '이미 사용 중인 slug 입니다.' },
        404: { message: '조직을 찾을 수 없습니다.' },
        400: { message: '수정할 수 없는 조직이거나 입력값을 확인하세요.' }
      }
    });
  }
}

// 조직 삭제: soft(WITHDRAWN) 또는 hard(purge). csc-control-tower DELETE 로 중계
export async function DELETE(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const { id, mode } = await event.request.json();
    if (typeof id !== 'number') {
      return fail('잘못된 요청입니다.', { status: 400 });
    }
    const path = `/platform/organizations/${id}${mode === 'hard' ? '/purge' : ''}`;
    await authControlClient(event).DELETE(path);
    return ok();
  } catch (error) {
    return mapHttpError(error, {
      fallback: '조직 삭제에 실패했습니다.',
      log: 'Delete organization failed',
      table: {
        ...AUTH_ERROR_RULES,
        404: { message: '조직을 찾을 수 없습니다.' },
        400: { message: '삭제할 수 없는 조직입니다.' }
      }
    });
  }
}
