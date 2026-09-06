// 채널 단건 BFF: 편집(이름, PATCH) / 삭제(DELETE). csc-marketing `/channels/:id` 중계
// 채널이 개인 소유라 게이트가 없다: ownerUserId 스코프가 곧 권한이고, 남의 채널은 백엔드에서
// 없는 것으로 취급된다(PATCH 는 404, DELETE 는 success:false)
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { mapMarketingError, parseChannelId, requireOrgUser } from '$lib/server/marketing/bff';

interface Channel {
  id: number;
  name: string;
}

/** 편집(이름): PATCH /api/marketing/channels/:channelId { name } */
export async function PATCH(event: RequestEvent) {
  const auth = await requireOrgUser(event);
  if ('error' in auth) return auth.error;

  const channelId = parseChannelId(event.params.channelId);
  const { name } = await event.request.json();
  if (!channelId || typeof name !== 'string' || name.trim() === '') {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    const res = await serverMarketingClient().PATCH<Channel>(`/channels/${channelId}`, {
      organizationId: auth.orgId,
      ownerUserId: auth.userId,
      name: name.trim()
    });
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '채널 편집에 실패했습니다.');
  }
}

/**
 * 삭제: DELETE /api/marketing/channels/:channelId (멱등)
 * 마지막 채널이면 백엔드가 400 을 준다(채널이 최소 하나는 있어야 한다). 그 메시지를 그대로 올린다.
 */
export async function DELETE(event: RequestEvent) {
  const auth = await requireOrgUser(event);
  if ('error' in auth) return auth.error;

  const channelId = parseChannelId(event.params.channelId);
  if (!channelId) {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    await serverMarketingClient().DELETE(
      `/channels/${channelId}?organizationId=${auth.orgId}&ownerUserId=${auth.userId}`
    );
    return json({ success: true });
  } catch (error) {
    return mapMarketingError(error, '채널 삭제에 실패했습니다.');
  }
}
