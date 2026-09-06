// 마케팅 영상 도구: 채널 slug 세그먼트 → currentChannelId 해석(서버 전용)
// [channelSlug] 페이지와 그 하위(plans/[planId]) 페이지 로드가 공유한다(중복 제거)
import { redirect, type ServerLoadEvent } from '@sveltejs/kit';
import { AiToolKey } from '@csc/entitlements';
import { channelPathSlug } from '$lib/features/marketing-channels/slugify';
import { fetchMyChannels, type MyChannel } from '$lib/server/marketing/myChannels';

/**
 * URL 의 채널 slug 로 현재 채널을 확정해 id 와 이름을 돌려준다.
 * 도구 불일치/미인증/채널 없음/조회 실패면 도구 랜딩(또는 로그인)으로 redirect 한다.
 * 목록은 본인 채널만 이라, 남의 채널 slug 를 주소로 열어도 여기서 랜딩으로 돌아간다.
 * `toolKey` 는 호출부가 상위 레이아웃 데이터(`event.parent()`)에서 얻어 넘긴다.
 *
 * 이름까지 돌려주는 이유: 앱바의 채널 드롭다운은 목록을 클라이언트에서 받아 오는데, 그 사이
 * 표시할 이름이 없어 '채널 선택' 자리표시자가 한 번 보였다. 여기서 이미 조회한 값을 버리지 않고
 * 내려보내면 첫 페인트부터 현재 채널 이름이 그대로 뜬다.
 */
export async function resolveCurrentChannel(
  event: ServerLoadEvent,
  toolKey: string,
): Promise<{ id: number; name: string }> {
  const base = `/${event.params.orgSlug}/${event.params.toolSlug}`;
  // 채널 세그먼트는 마케팅 영상 도구 전용: 다른 도구면 도구 랜딩으로
  if (toolKey !== AiToolKey.MarketingVideo) throw redirect(307, base);

  const user = await event.locals.getUser();
  const orgId = user?.organization?.id;
  if (!orgId) throw redirect(302, '/login');

  let channels: MyChannel[] = [];
  try {
    channels = await fetchMyChannels(orgId, user.id);
  } catch {
    // 조회 실패 → 어느 채널인지 확정할 수 없다. 도구 랜딩으로 되돌린다.
    throw redirect(307, base);
  }

  const current = channels.find((c) => channelPathSlug(c) === event.params.channelSlug);
  if (!current) throw redirect(307, base);
  return { id: current.id, name: current.name };
}
