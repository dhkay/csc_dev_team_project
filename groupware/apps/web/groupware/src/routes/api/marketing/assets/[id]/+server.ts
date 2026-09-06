// 조직 자산 수정(이름)/삭제 BFF: csc-marketing `PATCH/DELETE /common-assets/:id?organizationId=X`.
//   organizationId 를 주입해 소유권(자기 org)만 변경 가능. ROOT/대표/팀장만
import { json, type RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { requireToolManager, mapMarketingError, parsePositiveId } from '$lib/server/marketing/bff';
import { toTagIds } from '$lib/features/marketing-assets/types';

export async function PATCH(event: RequestEvent) {
  const auth = await requireToolManager(event);
  if ('error' in auth) return auth.error;
  const id = parsePositiveId(event.params.id);
  if (id === null) return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });

  const { name, tagIds } = await event.request.json();
  // 이름/태그 중 최소 하나는 있어야 하며, 이름을 줄 땐 비어 있으면 안 된다.
  const hasName = typeof name === 'string';
  const ids = toTagIds(tagIds);
  if (hasName && name.trim() === '') {
    return json({ success: false, error: '이름을 입력하세요.' }, { status: 400 });
  }
  if (!hasName && ids === undefined) {
    return json({ success: false, error: '수정할 내용이 없습니다.' }, { status: 400 });
  }

  try {
    const res = await serverMarketingClient().PATCH(
      `/common-assets/${id}?organizationId=${auth.orgId}`,
      {
        ...(hasName ? { name: name.trim() } : {}),
        ...(ids !== undefined ? { tagIds: ids } : {}),
      },
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '자산 수정에 실패했습니다.');
  }
}

export async function DELETE(event: RequestEvent) {
  const auth = await requireToolManager(event);
  if ('error' in auth) return auth.error;
  const id = parsePositiveId(event.params.id);
  if (id === null) return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });

  try {
    const res = await serverMarketingClient().DELETE(
      `/common-assets/${id}?organizationId=${auth.orgId}`,
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '자산 삭제에 실패했습니다.');
  }
}
