// 채널 BFF: csc-marketing `/channels` 로 중계(서비스토큰 자동 주입)
//
// 채널은 개인 소유다. (organizationId, ownerUserId) 를 BFF 가 세션에서 도출해 주입하므로 남의
// 채널은 목록에도 오지 않고 id 로도 잡히지 않는다. 그래서 관리 권한 게이트가 없다.
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { requireOrgUser, mapMarketingError } from '$lib/server/marketing/bff';

interface Channel {
  id: number;
  name: string;
}

/** 채널 목록: GET /api/marketing/channels (없으면 백엔드가 기본 채널을 만들어 준다) */
export async function GET(event: RequestEvent) {
  const auth = await requireOrgUser(event);
  if ('error' in auth) return auth.error;

  try {
    const res = await serverMarketingClient().GET<Channel[]>(
      `/channels?organizationId=${auth.orgId}&ownerUserId=${auth.userId}`
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '채널 목록을 불러오지 못했습니다.');
  }
}

/** 채널 생성: POST /api/marketing/channels { name } */
export async function POST(event: RequestEvent) {
  const auth = await requireOrgUser(event);
  if ('error' in auth) return auth.error;

  const { name } = await event.request.json();
  if (typeof name !== 'string' || name.trim() === '') {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    const res = await serverMarketingClient().POST<Channel>('/channels', {
      organizationId: auth.orgId,
      ownerUserId: auth.userId,
      name: name.trim()
    });
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '채널 추가에 실패했습니다.');
  }
}
