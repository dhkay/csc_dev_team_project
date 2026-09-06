// 태그 축 등록 BFF: csc-marketing `POST /asset-catalog/axes` 중계(서비스토큰 자동). 플랫폼(ai-tools-management) 전용
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError } from '$lib/server/http/bff';
import { requireAdminFeature } from '$lib/server/platform/guard';

export async function POST(event: RequestEvent) {
  const gateErr = await requireAdminFeature(event, 'ai-tools-management');
  if (gateErr) return gateErr;

  try {
    const { category, key, label, hint, sortOrder } = await event.request.json();
    if (typeof category !== 'string' || typeof key !== 'string' || typeof label !== 'string') {
      return fail('잘못된 요청입니다.', { status: 400 });
    }
    const res = await serverMarketingClient().POST('/asset-catalog/axes', {
      category,
      key,
      label,
      ...(typeof hint === 'string' ? { hint } : {}),
      ...(typeof sortOrder === 'number' ? { sortOrder } : {}),
    });
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '축 등록에 실패했습니다.',
      log: 'Create asset axis failed',
      table: { ...AUTH_ERROR_RULES, 400: { message: '입력값을 확인하세요.' } },
    });
  }
}
