// 에셋 세트 생성 BFF: csc-marketing `POST /asset-sets` 로 중계. 플랫폼 관리자(ai-tools-management) 전용
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError } from '$lib/server/http/bff';
import { requireAdminFeature } from '$lib/server/platform/guard';

export async function POST(event: RequestEvent) {
  const gateErr = await requireAdminFeature(event, 'ai-tools-management');
  if (gateErr) return gateErr;

  try {
    const { name, overlays } = await event.request.json();
    if (typeof name !== 'string' || !name.trim()) {
      return fail('세트 이름을 입력하세요.', { status: 400 });
    }
    const res = await serverMarketingClient().POST('/asset-sets', {
      name,
      ...(overlays ? { overlays } : {}),
      ...(typeof event.locals.userId === 'number' ? { createdByAdminId: event.locals.userId } : {}),
    });
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '세트 생성에 실패했습니다.',
      log: 'Create asset set failed',
      table: { ...AUTH_ERROR_RULES, 400: { message: '입력값을 확인하세요.' } },
    });
  }
}
