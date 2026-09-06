// 도구 랜딩: 마케팅 영상 도구는 버전 + 채널을 주소에 갖는다(`/{org}/{tool}/{version}/{channel}`)
// 여기서 그 둘을 채워 리다이렉트한다: 버전은 본인이 마지막으로 쓴 것, 채널은 본인이 정한 진입 채널
// 채널은 개인 소유이고 백엔드가 목록 조회에서 없으면 기본 채널('기본')을 만들어 주므로, 빈 목록은
// 조회 실패일 때만 나온다. 다른 도구는 채널/버전 개념이 없어 그대로 렌더(currentChannelId=null)
import { redirect } from '@sveltejs/kit';
import { AiToolKey } from '@csc/entitlements';
import { resolveEntryChannelSlug, resolveEntryVersion } from '$lib/server/marketing/entryChannel';
import { workspaceBasePath } from '$lib/pages/tools/marketing-video/workspaceUrl';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  // 마케팅 영상 도구(key)가 아니면 채널 라우팅과 무관(slug 는 DB 관리라 key 로 판별)
  const { tool } = await event.parent();
  if (tool.key !== AiToolKey.MarketingVideo) {
    return { currentChannelId: null };
  }

  const [version, slug] = await Promise.all([
    resolveEntryVersion(event),
    resolveEntryChannelSlug(event),
  ]);
  if (!slug) return { currentChannelId: null };
  const { orgSlug, toolSlug } = event.params;
  throw redirect(307, workspaceBasePath({ orgSlug, toolSlug, version, channelSlug: slug }));
};
