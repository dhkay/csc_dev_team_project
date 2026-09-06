// 공통 에셋 삭제 BFF: csc-marketing `DELETE /common-assets/:id` 로 중계(메타 + file-upload 바이트)
//   플랫폼 관리자(ai-tools-management) 전용
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError } from '$lib/server/http/bff';
import { requireAdminFeature } from '$lib/server/platform/guard';

// 공통 에셋 수정(표시/실제 텍스트): csc-marketing `PATCH /common-assets/:id` 로 중계. 플랫폼 관리자 전용
export async function PATCH(event: RequestEvent) {
  const gateErr = await requireAdminFeature(event, 'ai-tools-management');
  if (gateErr) return gateErr;

  const id = Number(event.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }

  try {
    const patch = await event.request.json();
    const res = await serverMarketingClient().PATCH(`/common-assets/${id}`, patch);
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '수정에 실패했습니다.',
      log: 'Update common asset failed',
      table: { ...AUTH_ERROR_RULES, 404: { message: '에셋을 찾을 수 없습니다.' } },
    });
  }
}

export async function DELETE(event: RequestEvent) {
  const gateErr = await requireAdminFeature(event, 'ai-tools-management');
  if (gateErr) return gateErr;

  const id = Number(event.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }

  try {
    const res = await serverMarketingClient().DELETE<{ success: boolean }>(`/common-assets/${id}`);
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '삭제에 실패했습니다.',
      log: 'Delete common asset failed',
      table: { ...AUTH_ERROR_RULES, 404: { message: '에셋을 찾을 수 없습니다.' } },
    });
  }
}
