// 조직 태그 값 삭제 BFF: csc-marketing `DELETE /asset-catalog/tags/:id?organizationId=X`.
//   자기 조직 태그만 삭제 가능(공통 태그는 백엔드가 거부). ROOT/대표/팀장만
import { json, type RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { requireToolManager, mapMarketingError, parsePositiveId } from '$lib/server/marketing/bff';

export async function DELETE(event: RequestEvent) {
  const auth = await requireToolManager(event);
  if ('error' in auth) return auth.error;
  const id = parsePositiveId(event.params.id);
  if (id === null) return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });

  try {
    const res = await serverMarketingClient().DELETE(
      `/asset-catalog/tags/${id}?organizationId=${auth.orgId}`,
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '태그 삭제에 실패했습니다.');
  }
}
