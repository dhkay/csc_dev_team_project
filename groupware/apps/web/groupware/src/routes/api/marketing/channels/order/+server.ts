// 채널 순서 변경 BFF: csc-marketing `PUT /channels/order` 중계
// orderedIds 순서대로 sort_order 를 재지정한다. 채널이 개인 소유라 본인 목록의 순서이고,
// (organizationId, ownerUserId) 는 BFF 가 세션에서 주입한다(남의 id 가 섞여 와도 백엔드가 무시)
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { requireOrgUser, mapMarketingError } from '$lib/server/marketing/bff';

/** 순서 변경: PUT /api/marketing/channels/order { orderedIds: number[] } */
export async function PUT(event: RequestEvent) {
  const auth = await requireOrgUser(event);
  if ('error' in auth) return auth.error;

  const { orderedIds } = await event.request.json();
  if (
    !Array.isArray(orderedIds) ||
    orderedIds.length === 0 ||
    orderedIds.some((n) => !Number.isInteger(n))
  ) {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    await serverMarketingClient().PUT('/channels/order', {
      organizationId: auth.orgId,
      ownerUserId: auth.userId,
      orderedIds
    });
    return json({ success: true });
  } catch (error) {
    return mapMarketingError(error, '채널 순서 변경에 실패했습니다.');
  }
}
