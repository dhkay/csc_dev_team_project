import type { PageServerLoad } from './$types';
import { loadAssetSets } from '$lib/server/marketing/assetSets';
import { versionProfile } from '$lib/pages/tools/marketing-video/versionProfile';

// 워크스페이스: 세트 적용 피커용 에셋 세트(공통 ∪ 자기 org) SSR 로드. uploadId → 접근 URL 재구성
//   목록은 정적이라 SSR 1회면 충분(TanStack 폴링 불필요). 세트 편집은 에셋 섹션(assets/+page.server)이 담당
//   organizationId 를 백엔드로 전달해 common ∪ 자기 org 만 조회(타 org 격리): 에셋 로더와 동형
//
// 최종 구역이 없는 버전에서는 아예 부르지 않는다. 세트를 입힐 자리가 없어 피커가 그려지지 않으므로,
//   받아 온 목록을 아무도 읽지 않는다. 세트는 org 스코프라 다른 버전에서 만든 것이 딸려 오는데, 그것을
//   쓰지도 못하면서 채널을 열 때마다 한 번씩 받아 왔다.

export const load: PageServerLoad = async (event) => {
  const version = versionProfile(event.params.version as never);
  if (!version.workspaceStages.includes('final')) return { assetSets: [] };

  const user = await event.locals.getUser();
  const orgId = user?.organization?.id ?? null;

  return { assetSets: await loadAssetSets(orgId) };
};
