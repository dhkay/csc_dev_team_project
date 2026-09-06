// 조직 세트 수정(이름)/삭제 BFF: csc-marketing `PATCH/DELETE /asset-sets/:id?organizationId=X`.
//   organizationId 주입 → 소유권(자기 org)만. ROOT/대표/팀장만
import { json, type RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { requireToolManager, mapMarketingError, parsePositiveId } from '$lib/server/marketing/bff';

export async function PATCH(event: RequestEvent) {
  const auth = await requireToolManager(event);
  if ('error' in auth) return auth.error;
  const id = parsePositiveId(event.params.id);
  if (id === null) return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });

  // 이름/오버레이 스타일 부분 수정: 둘 다 선택. 이름을 보낼 땐 비어있으면 거부
  const { name, overlays } = await event.request.json();
  const hasName = name !== undefined;
  const hasOverlays = overlays !== undefined;
  if (hasName && (typeof name !== 'string' || name.trim() === '')) {
    return json({ success: false, error: '이름을 입력하세요.' }, { status: 400 });
  }
  if (!hasName && !hasOverlays) {
    return json({ success: false, error: '변경할 내용이 없습니다.' }, { status: 400 });
  }

  try {
    const res = await serverMarketingClient().PATCH(`/asset-sets/${id}?organizationId=${auth.orgId}`, {
      ...(hasName ? { name: name.trim() } : {}),
      ...(hasOverlays ? { overlays } : {}),
    });
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '세트 수정에 실패했습니다.');
  }
}

export async function DELETE(event: RequestEvent) {
  const auth = await requireToolManager(event);
  if ('error' in auth) return auth.error;
  const id = parsePositiveId(event.params.id);
  if (id === null) return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });

  try {
    const res = await serverMarketingClient().DELETE(
      `/asset-sets/${id}?organizationId=${auth.orgId}`,
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '세트 삭제에 실패했습니다.');
  }
}
