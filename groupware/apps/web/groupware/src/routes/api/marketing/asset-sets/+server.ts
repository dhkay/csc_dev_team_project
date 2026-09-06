// 조직 세트 생성 BFF: csc-marketing `POST /asset-sets`(organizationId 주입 → scope='organization'). ROOT/대표/팀장만
import { json, type RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { requireToolManager, mapMarketingError } from '$lib/server/marketing/bff';

export async function POST(event: RequestEvent) {
  const auth = await requireToolManager(event);
  if ('error' in auth) return auth.error;

  const { name, overlays } = await event.request.json();
  if (typeof name !== 'string' || name.trim() === '') {
    return json({ success: false, error: '세트 이름을 입력하세요.' }, { status: 400 });
  }

  try {
    const res = await serverMarketingClient().POST('/asset-sets', {
      name: name.trim(),
      organizationId: auth.orgId,
      ...(overlays ? { overlays } : {}),
    });
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '세트 생성에 실패했습니다.');
  }
}
