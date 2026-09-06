// 저장 기획안 상세: /{org}/{tool}/{version}/{channelSlug}/plans/{planId}.
// 채널 확정/가드는 상위 [channelSlug]/+layout.server(resolveCurrentChannel)가 담당하므로, 여기선
// 저장본 단건 존재/소유만 확인한다(없으면 채널 베이스로 redirect). 저장본 목록 BFF(url 재구성 + 세션 인증)를
// 재사용해 단건을 찾는다(단건 엔드포인트 없음. 개인 목록은 소량)
import { redirect } from '@sveltejs/kit';
import { workspaceBasePath } from '$lib/pages/tools/marketing-video/workspaceUrl';
import type { SavedPlan } from '$lib/features/marketing-channels/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const { orgSlug, toolSlug, channelSlug, planId } = event.params;
  // 버전은 상위 셸이 확정한 값을 쓴다(주소의 세 번째 조각)
  const { currentChannelId, version } = await event.parent();
  const base = workspaceBasePath({ orgSlug, toolSlug, version, channelSlug });

  const id = Number(planId);
  if (!Number.isInteger(id) || id <= 0) throw redirect(307, base);

  // channelId 와 version 은 목록 BFF 의 필수값이다. 하나라도 빠뜨리면 400 이 '저장본 없음'으로
  //   해석돼 아래 redirect 로 빠지고, 화면에선 상세가 안 열리는 것처럼 보인다.
  const res = await event.fetch(
    `/api/marketing/saved-plans?channelId=${currentChannelId}&version=${version}`,
  );
  const body: { success?: boolean; data?: SavedPlan[] } | null = res.ok
    ? await res.json().catch(() => null)
    : null;
  const initialPlan = body?.success ? (body.data ?? []).find((p) => p.id === id) ?? null : null;
  if (!initialPlan) throw redirect(307, base); // 없거나 남의 것 → 채널 베이스로

  return { initialPlan };
};
