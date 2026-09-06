// AI 어시스턴트 전역 설정 수정 BFF: csc-control-tower `PATCH /platform/assistant-settings` 로 중계
// 조회(GET)는 SSR(+page.server.ts authControlClient)에서 직접. 여기선 수정만
import type { RequestEvent } from '@sveltejs/kit';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

export async function PATCH(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const patch = await event.request.json();
    const res = await authControlClient(event).PATCH('/platform/assistant-settings', patch);
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: 'AI 어시스턴트 설정 수정에 실패했습니다.',
      log: 'Update assistant settings failed',
      table: {
        ...AUTH_ERROR_RULES,
        400: { errorCode: 'INVALID_INPUT', message: '입력값을 확인하세요.' },
      },
    });
  }
}
