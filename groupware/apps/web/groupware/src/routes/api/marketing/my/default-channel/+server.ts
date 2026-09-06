// 진입 채널 BFF: csc-marketing `/user-settings/default-channel` 중계
// GET 은 앱바 드롭다운이 "지금 내 진입 채널"을 별로 표시하는 데 쓴다. 도구 랜딩은 렌더 전에 알아야
//   해서 서버에서 백엔드를 직접 부른다(같은 값, 다른 시점)
//
// 권한 게이트가 없다(requireOrgUser 로 본인 확인만): 무엇을 먼저 볼지는 각자의 작업 습관이라
//   남의 허락이 필요하지 않다. 조직 공유 '대표 채널'(팀장이 정하던 것)을 대신한다.
// ownerUserId 는 세션에서 나온다(본문 값을 쓰면 남의 진입 채널을 바꿀 수 있다)
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { mapMarketingError, requireOrgUser } from '$lib/server/marketing/bff';

/** 조회: GET /api/marketing/my/default-channel → { data: { channelId } } */
export async function GET(event: RequestEvent) {
  const auth = await requireOrgUser(event);
  if ('error' in auth) return auth.error;

  try {
    const res = await serverMarketingClient().GET<{ channelId: number | null }>(
      `/user-settings/default-channel?organizationId=${auth.orgId}&ownerUserId=${auth.userId}`,
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '진입 채널을 불러오지 못했습니다.');
  }
}

/** 지정/해제: PUT /api/marketing/my/default-channel { channelId: number | null } */
export async function PUT(event: RequestEvent) {
  const auth = await requireOrgUser(event);
  if ('error' in auth) return auth.error;

  const body = (await event.request.json().catch(() => null)) as { channelId?: unknown } | null;
  // 양의 정수만 지정으로 본다. 그 외(null/미지정/쓰레기값)는 해제 → 첫 채널로 돌아간다.
  const raw = body?.channelId;
  const channelId = typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : null;

  try {
    const res = await serverMarketingClient().PUT<{ channelId: number | null }>(
      '/user-settings/default-channel',
      { organizationId: auth.orgId, ownerUserId: auth.userId, channelId },
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '진입 채널을 저장하지 못했습니다.');
  }
}
