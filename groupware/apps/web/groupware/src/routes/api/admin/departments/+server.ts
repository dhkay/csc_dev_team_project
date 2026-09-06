// 부서(조직도) 관리 BFF: user 서버 `/user-api/org/departments*`(JWT=슈퍼관리자)로 중계
// 조직/역할(ROOT), 테넌트 격리는 user 서버가 토큰으로 강제. 목록 조회는 SSR(+page.server.ts)에서
import type { RequestEvent } from '@sveltejs/kit';
import { authUserClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';
import type { Department } from '$lib/features/departments/types';

/** 부서 라우트 공통 에러 매핑(3 메서드 공유) */
function mapError(error: unknown, fallback: string): Response {
  return mapHttpError(error, {
    fallback,
    log: 'Department request failed',
    table: {
      ...AUTH_ERROR_RULES,
      400: { message: '해당 위치로 이동할 수 없습니다.' },
      404: { message: '부서를 찾을 수 없습니다.' }
    }
  });
}

// 부서 추가: POST { parentId?, name }
export async function POST(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const body = await event.request.json();
    const res = await authUserClient(event).POST<Department>('/user-api/org/departments', body);
    return ok(res.data);
  } catch (error) {
    return mapError(error, '부서 추가에 실패했습니다.');
  }
}

// 부서 수정: PATCH { id, name?, parentId? }(이름 변경 / 이동)
export async function PATCH(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const body = await event.request.json();
    const { id, name } = body;
    const hasParent = 'parentId' in body;
    if (typeof id !== 'number' || (name === undefined && !hasParent)) {
      return fail('잘못된 요청입니다.', { status: 400 });
    }
    const patch: { name?: string; parentId?: number | null } = {};
    if (typeof name === 'string') patch.name = name;
    if (hasParent) patch.parentId = body.parentId ?? null;
    const res = await authUserClient(event).PATCH<Department>(
      `/user-api/org/departments/${id}`,
      patch,
    );
    return ok(res.data);
  } catch (error) {
    return mapError(error, '부서 저장에 실패했습니다.');
  }
}

// 부서 삭제: DELETE { id }(서브트리 + 소속 멤버 미배치)
export async function DELETE(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const { id } = await event.request.json();
    if (typeof id !== 'number') {
      return fail('잘못된 요청입니다.', { status: 400 });
    }
    await authUserClient(event).DELETE(`/user-api/org/departments/${id}`);
    return ok();
  } catch (error) {
    return mapError(error, '부서 삭제에 실패했습니다.');
  }
}
