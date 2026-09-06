// 세트 슬롯(frame/outro) 지정/비우기 BFF: csc-marketing `PUT/DELETE /asset-sets/:id/slots/:slot`.
//   PUT 은 { uploadId } 로 슬롯에 업로드를 지정/교체(옛 바이트 삭제), DELETE 는 슬롯 비우기. 플랫폼 관리자 전용
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError } from '$lib/server/http/bff';
import { requireAdminFeature } from '$lib/server/platform/guard';

function parseParams(event: RequestEvent): { id: number; slot: string } | null {
  const id = Number(event.params.id);
  const slot = event.params.slot;
  if (!Number.isInteger(id) || id <= 0 || !slot) return null;
  return { id, slot };
}

export async function PUT(event: RequestEvent) {
  const gateErr = await requireAdminFeature(event, 'ai-tools-management');
  if (gateErr) return gateErr;
  const p = parseParams(event);
  if (!p) return fail('잘못된 요청입니다.', { status: 400 });

  try {
    const { uploadId } = await event.request.json();
    if (typeof uploadId !== 'string' || !uploadId) {
      return fail('잘못된 요청입니다.', { status: 400 });
    }
    const res = await serverMarketingClient().PUT(
      `/asset-sets/${p.id}/slots/${encodeURIComponent(p.slot)}`,
      { uploadId },
    );
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '슬롯 지정에 실패했습니다.',
      log: 'Set asset set slot failed',
      table: {
        ...AUTH_ERROR_RULES,
        400: { message: '올바른 슬롯이 아닙니다.' },
        404: { message: '세트를 찾을 수 없습니다.' },
      },
    });
  }
}

export async function DELETE(event: RequestEvent) {
  const gateErr = await requireAdminFeature(event, 'ai-tools-management');
  if (gateErr) return gateErr;
  const p = parseParams(event);
  if (!p) return fail('잘못된 요청입니다.', { status: 400 });

  try {
    const res = await serverMarketingClient().DELETE(
      `/asset-sets/${p.id}/slots/${encodeURIComponent(p.slot)}`,
    );
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '슬롯 비우기에 실패했습니다.',
      log: 'Clear asset set slot failed',
      table: { ...AUTH_ERROR_RULES, 404: { message: '세트를 찾을 수 없습니다.' } },
    });
  }
}
