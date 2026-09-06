// 조직 태그 값 등록 BFF: csc-marketing `POST /asset-catalog/tags?organizationId=X`(조직 전용 태그). ROOT/대표/팀장만
//   축은 공통 또는 자기 조직 축이어야 한다(백엔드 검증). 공통 축 아래에도 조직 태그를 더할 수 있다.
import { json, type RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { requireToolManager, mapMarketingError } from '$lib/server/marketing/bff';

export async function POST(event: RequestEvent) {
  const auth = await requireToolManager(event);
  if ('error' in auth) return auth.error;

  const { axisId, value, label, sortOrder } = await event.request.json();
  if (!Number.isInteger(axisId) || axisId <= 0 || typeof value !== 'string') {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }
  try {
    const res = await serverMarketingClient().POST(
      `/asset-catalog/tags?organizationId=${auth.orgId}`,
      {
        axisId,
        value,
        ...(typeof label === 'string' ? { label } : {}),
        ...(typeof sortOrder === 'number' ? { sortOrder } : {}),
      },
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '태그 등록에 실패했습니다.');
  }
}
