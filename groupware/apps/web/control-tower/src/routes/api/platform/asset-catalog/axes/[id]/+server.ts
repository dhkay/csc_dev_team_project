// 태그 축 삭제 BFF: csc-marketing `DELETE /asset-catalog/axes/:id`. 플랫폼(ai-tools-management) 전용
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError } from '$lib/server/http/bff';
import { requireAdminFeature } from '$lib/server/platform/guard';

function parseId(event: RequestEvent): number | null {
  const id = Number(event.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function DELETE(event: RequestEvent) {
  const gateErr = await requireAdminFeature(event, 'ai-tools-management');
  if (gateErr) return gateErr;
  const id = parseId(event);
  if (id === null) return fail('잘못된 요청입니다.', { status: 400 });

  try {
    const res = await serverMarketingClient().DELETE<{ success: boolean }>(`/asset-catalog/axes/${id}`);
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '축 삭제에 실패했습니다.',
      log: 'Delete asset axis failed',
      table: { ...AUTH_ERROR_RULES },
    });
  }
}
