// 버전 랜딩(`/{org}/{tool}/{version}`): 채널이 빠진 주소를 진입 채널로 채운다.
// 도구 랜딩(`/{org}/{tool}`)이 버전까지 채워 보내지만, 사람이 버전까지만 적은 주소를 열 수도 있다.
import { redirect } from '@sveltejs/kit';
import { AiToolKey } from '@csc/entitlements';
import { resolveEntryChannelSlug } from '$lib/server/marketing/entryChannel';
import { workspaceBasePath } from '$lib/pages/tools/marketing-video/workspaceUrl';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const { tool, version } = await event.parent();
  const { orgSlug, toolSlug } = event.params;
  // 채널 세그먼트는 마케팅 영상 도구 전용: 다른 도구면 도구 랜딩으로(채널 셸과 같은 규칙)
  if (tool.key !== AiToolKey.MarketingVideo) {
    throw redirect(307, `/${orgSlug}/${toolSlug}`);
  }

  const slug = await resolveEntryChannelSlug(event);
  // 채널을 못 정하면 도구 랜딩으로 돌려보낸다(거기서 같은 판단을 하고 안내 화면을 그린다)
  if (!slug) throw redirect(307, `/${orgSlug}/${toolSlug}`);
  throw redirect(307, workspaceBasePath({ orgSlug, toolSlug, version, channelSlug: slug }));
};
