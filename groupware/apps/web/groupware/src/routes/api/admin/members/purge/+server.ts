// 조직 사용자관리 BFF: 일반관리자 영구 삭제(단계적 삭제 2단계)
// 이미 삭제(soft-delete=WITHDRAWN)된 대상만 user 서버(/user-api/org/members/:id/purge)가 hard-delete 한다(활성 대상은 403)
// 테넌트 격리, ROOT 강제는 user 서버가 토큰으로 강제. authUserClient 가 access + X-Service-Token 자동 주입
import type { RequestEvent } from '@sveltejs/kit';
import { authUserClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

export async function DELETE(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const { id } = await event.request.json();
    if (typeof id !== 'number') {
      return fail('잘못된 요청입니다.', { status: 400 });
    }
    await authUserClient(event).DELETE(`/user-api/org/members/${id}/purge`);
    return ok();
  } catch (error) {
    return mapHttpError(error, {
      fallback: '영구 삭제에 실패했습니다.',
      log: 'Purge member failed',
      table: {
        404: { message: '관리자를 찾을 수 없습니다.' },
        // 활성 멤버(아직 삭제 안 됨) 등: 먼저 삭제(soft) 후 영구 삭제 가능
        403: { message: '영구 삭제는 이미 삭제된 관리자만 가능합니다.' },
        401: { message: '권한이 없습니다.' }
      }
    });
  }
}
