// 태그 값 등록 BFF: csc-marketing `POST /asset-catalog/tags`. 플랫폼(ai-tools-management) 전용
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError } from '$lib/server/http/bff';
import { requireAdminFeature } from '$lib/server/platform/guard';

export async function POST(event: RequestEvent) {
  const gateErr = await requireAdminFeature(event, 'ai-tools-management');
  if (gateErr) return gateErr;

  try {
    const { axisId, value, label, sortOrder } = await event.request.json();
    if (!Number.isInteger(axisId) || axisId <= 0 || typeof value !== 'string') {
      return fail('잘못된 요청입니다.', { status: 400 });
    }
    const res = await serverMarketingClient().POST('/asset-catalog/tags', {
      axisId,
      value,
      ...(typeof label === 'string' ? { label } : {}),
      ...(typeof sortOrder === 'number' ? { sortOrder } : {}),
    });
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '태그 등록에 실패했습니다.',
      log: 'Create asset tag failed',
      table: { ...AUTH_ERROR_RULES, 400: { message: '입력값을 확인하세요.' } },
    });
  }
}
