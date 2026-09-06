// 직책(대표/팀장) 부여 BFF: user 서버 `/user-api/org/members/:id/position`(JWT=조직 관리자)로 중계
// 멤버 직책을 설정/해제. 대표↔팀장 상호배제(단일 값), 대표=ROOT 전용, 팀장 부서당 1명은 user 서버가 강제
// 부서당 팀장 1명 위반은 409(errorCode=TEAM_LEADER_EXISTS) 로, 서버 메시지를 그대로 전달해 안내한다.
import type { RequestEvent } from '@sveltejs/kit';
import { isOrgPosition } from '@csc/entitlements';
import { authUserClient } from '$lib/infrastructure/http/serverClientInstances';
import { isHttpError } from '$lib/infrastructure/http';
import { ok, fail, requireAuth } from '$lib/server/http/bff';

// 멤버 직책 설정: POST { id, position: 'REPRESENTATIVE'|'TEAM_LEADER'|null }
export async function POST(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const { id, position } = await event.request.json();
    // position 은 카탈로그 직책 key 또는 null(해제)만 허용
    if (typeof id !== 'number' || (position !== null && !isOrgPosition(position))) {
      return fail('잘못된 요청입니다.', { status: 400 });
    }
    await authUserClient(event).POST(`/user-api/org/members/${id}/position`, { position });
    return ok();
  } catch (error) {
    if (isHttpError(error)) {
      const body = error.response?.data as { message?: string; errorCode?: string } | undefined;
      console.error('Position set failed (status):', error.statusCode, body?.errorCode);
      // 도메인 에러(409 부서당 1명 / 400 부서 필수 / 403 권한 / 404 대상)는 서버 메시지, errorCode 를 전달
      if (error.statusCode >= 400 && error.statusCode < 500) {
        return fail(body?.message ?? '직책 설정에 실패했습니다.', {
          status: error.statusCode,
          errorCode: body?.errorCode
        });
      }
    } else {
      console.error('Position set failed:', error instanceof Error ? error.message : 'unknown');
    }
    return fail('직책 설정에 실패했습니다.', { status: 500 });
  }
}
