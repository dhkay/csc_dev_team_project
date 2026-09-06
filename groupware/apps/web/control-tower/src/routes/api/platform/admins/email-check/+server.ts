// 관리자 이메일 중복 확인 BFF: csc-control-tower `/platform/admins/email-available`(ROOT 전용) 로 중계
// 저장 전 사전 확인이라 읽기 전용이며, 저장 시점의 중복 검증(409)을 대체하지 않는다.
import type { RequestEvent } from '@sveltejs/kit';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';
import type { AdminEmailAvailability } from '$lib/features/admins/types';

export async function GET(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;

  const email = event.url.searchParams.get('email')?.trim() ?? '';
  if (!email) {
    return fail('이메일을 입력하세요.', { status: 400, errorCode: 'INVALID_INPUT' });
  }
  const rawExcludeId = event.url.searchParams.get('excludeId');
  const excludeId = rawExcludeId === null ? undefined : Number(rawExcludeId);
  if (excludeId !== undefined && !Number.isInteger(excludeId)) {
    return fail('잘못된 요청입니다.', { status: 400, errorCode: 'INVALID_INPUT' });
  }

  try {
    const query = new URLSearchParams({ email });
    if (excludeId !== undefined) query.set('excludeId', String(excludeId));
    const res = await authControlClient(event).GET<AdminEmailAvailability>(
      `/platform/admins/email-available?${query.toString()}`
    );
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '이메일 확인에 실패했습니다.',
      log: 'Check admin email failed',
      table: {
        ...AUTH_ERROR_RULES,
        400: { errorCode: 'INVALID_INPUT', message: '이메일 형식을 확인하세요.' }
      }
    });
  }
}
