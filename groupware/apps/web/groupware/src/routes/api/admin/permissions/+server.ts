// 권한 부여 BFF: user 서버 `/user-api/org/{departments,members}/:id/permissions`(JWT=슈퍼관리자)로 중계
// 부서/멤버 권한을 desired key 집합으로 설정. 현황(매트릭스, /30)은 SSR(+page.server.ts)에서 조회
// 테넌트 격리, ROOT 강제, 대상 검증은 user 서버가 토큰으로 강제
import type { RequestEvent } from '@sveltejs/kit';
import { authUserClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

// 부서/멤버 권한 설정: POST { target: 'department'|'member', id, permissionKeys }
export async function POST(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const { target, id, permissionKeys } = await event.request.json();
    if (
      (target !== 'department' && target !== 'member') ||
      typeof id !== 'number' ||
      !Array.isArray(permissionKeys)
    ) {
      return fail('잘못된 요청입니다.', { status: 400 });
    }
    const path =
      target === 'department'
        ? `/user-api/org/departments/${id}/permissions`
        : `/user-api/org/members/${id}/permissions`;
    await authUserClient(event).POST(path, { permissionKeys });
    return ok();
  } catch (error) {
    return mapHttpError(error, {
      fallback: '권한 설정에 실패했습니다.',
      log: 'Permission set failed',
      table: {
        ...AUTH_ERROR_RULES,
        404: { message: '대상을 찾을 수 없습니다.' },
        400: { message: '입력값을 확인하세요.' }
      }
    });
  }
}
