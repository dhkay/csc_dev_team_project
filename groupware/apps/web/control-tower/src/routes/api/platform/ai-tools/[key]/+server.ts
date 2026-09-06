// AI 도구 표시명/slug 수정 BFF: csc-control-tower `PATCH /platform/ai-tools/:key` 로 중계
// slug 중복(409), 예약어/형식(400)을 인라인 처리용 errorCode 로 정규화한다.
import type { RequestEvent } from '@sveltejs/kit';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

export async function PATCH(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  const key = event.params.key;
  if (!key) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }
  try {
    const patch = await event.request.json();
    const res = await authControlClient(event).PATCH(
      `/platform/ai-tools/${encodeURIComponent(key)}`,
      patch,
    );
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: 'AI 도구 수정에 실패했습니다.',
      log: 'Update AI tool failed',
      table: {
        ...AUTH_ERROR_RULES,
        409: { errorCode: 'SLUG_TAKEN', message: '이미 사용 중인 slug 입니다.' },
        400: {
          errorCode: 'INVALID_INPUT',
          message: '입력값을 확인하세요(예약된 slug 일 수 있습니다).'
        },
        404: { message: 'AI 도구를 찾을 수 없습니다.' }
      }
    });
  }
}
