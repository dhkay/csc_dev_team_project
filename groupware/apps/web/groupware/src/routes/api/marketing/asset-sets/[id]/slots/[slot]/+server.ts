// 조직 세트 슬롯 지정/비우기 BFF: csc-marketing `PUT/DELETE /asset-sets/:id/slots/:slot?organizationId=X`.
//   PUT { uploadId } 로 슬롯에 업로드 지정/교체(옛 바이트 삭제), DELETE 슬롯 비우기. organizationId 주입 → 소유권. ROOT/대표/팀장만
import { json, type RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { requireToolManager, mapMarketingError } from '$lib/server/marketing/bff';

function parseParams(event: RequestEvent): { id: number; slot: string } | null {
  const id = Number(event.params.id);
  const slot = event.params.slot;
  if (!Number.isInteger(id) || id <= 0 || !slot) return null;
  return { id, slot };
}

export async function PUT(event: RequestEvent) {
  const auth = await requireToolManager(event);
  if ('error' in auth) return auth.error;
  const p = parseParams(event);
  if (!p) return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });

  const { uploadId } = await event.request.json();
  if (typeof uploadId !== 'string' || !uploadId) {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    const res = await serverMarketingClient().PUT(
      `/asset-sets/${p.id}/slots/${encodeURIComponent(p.slot)}?organizationId=${auth.orgId}`,
      { uploadId },
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '슬롯 지정에 실패했습니다.');
  }
}

export async function DELETE(event: RequestEvent) {
  const auth = await requireToolManager(event);
  if ('error' in auth) return auth.error;
  const p = parseParams(event);
  if (!p) return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });

  try {
    const res = await serverMarketingClient().DELETE(
      `/asset-sets/${p.id}/slots/${encodeURIComponent(p.slot)}?organizationId=${auth.orgId}`,
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '슬롯 비우기에 실패했습니다.');
  }
}
