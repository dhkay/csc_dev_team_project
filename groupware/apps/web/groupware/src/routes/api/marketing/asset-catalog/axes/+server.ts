// 조직 태그 축 등록 BFF: csc-marketing `POST /asset-catalog/axes?organizationId=X`(조직 전용 축). ROOT/대표/팀장만
import { json, type RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { requireToolManager, mapMarketingError } from '$lib/server/marketing/bff';

export async function POST(event: RequestEvent) {
  const auth = await requireToolManager(event);
  if ('error' in auth) return auth.error;

  const { category, key, label, hint, sortOrder } = await event.request.json();
  if (typeof category !== 'string' || typeof key !== 'string' || typeof label !== 'string') {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }
  try {
    const res = await serverMarketingClient().POST(
      `/asset-catalog/axes?organizationId=${auth.orgId}`,
      {
        category,
        key,
        label,
        ...(typeof hint === 'string' ? { hint } : {}),
        ...(typeof sortOrder === 'number' ? { sortOrder } : {}),
      },
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '축 등록에 실패했습니다.');
  }
}
