// 에셋 세트 수정/삭제 BFF: csc-marketing `PATCH/DELETE /asset-sets/:id` 로 중계. 플랫폼 관리자 전용
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError } from '$lib/server/http/bff';
import { requireAdminFeature } from '$lib/server/platform/guard';

function parseId(event: RequestEvent): number | null {
  const id = Number(event.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(event: RequestEvent) {
  const gateErr = await requireAdminFeature(event, 'ai-tools-management');
  if (gateErr) return gateErr;
  const id = parseId(event);
  if (id === null) return fail('잘못된 요청입니다.', { status: 400 });

  try {
    const patch = await event.request.json();
    const res = await serverMarketingClient().PATCH(`/asset-sets/${id}`, patch);
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '세트 수정에 실패했습니다.',
      log: 'Update asset set failed',
      table: { ...AUTH_ERROR_RULES, 404: { message: '세트를 찾을 수 없습니다.' } },
    });
  }
}

export async function DELETE(event: RequestEvent) {
  const gateErr = await requireAdminFeature(event, 'ai-tools-management');
  if (gateErr) return gateErr;
  const id = parseId(event);
  if (id === null) return fail('잘못된 요청입니다.', { status: 400 });

  try {
    const res = await serverMarketingClient().DELETE<{ success: boolean }>(`/asset-sets/${id}`);
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '세트 삭제에 실패했습니다.',
      log: 'Delete asset set failed',
      table: { ...AUTH_ERROR_RULES, 404: { message: '세트를 찾을 수 없습니다.' } },
    });
  }
}
