import { redirect } from '@sveltejs/kit';
import { loadOrgMemberRoster } from '$lib/server/marketing/roster';
import { loadOrgChannelRoster } from '$lib/server/marketing/channelRoster';
import { createMemberIdentityLookup } from '$lib/features/members/lib/roster';
import { toChannelFilterOptions } from '$lib/features/marketing-activity-logs/lib/channelOptions';
import { workspaceBasePath } from '$lib/pages/tools/marketing-video/workspaceUrl';
import type { PageServerLoad } from './$types';

// 로그는 관리급(루트/대표/팀장 = canViewLogs, 부모 [toolSlug] 레이아웃 계산)만 볼 수 있다.
// 보이는 범위는 조직 전체다. 모든 채널, 두 버전(v1.0/v1.5)의 활동이 한 원장에 있다.
// nav 숨김은 UX 이고 이 게이트가 직접 URL 접근을 막는다(process/price 와 동일 패턴)
// 데이터 조회 자체도 BFF requireLogViewer 가 같은 판정 함수로 다시 막는다(이중 방어)

export const load: PageServerLoad = async (event) => {
  const { canViewLogs, version } = await event.parent();
  if (!canViewLogs) {
    const { orgSlug, toolSlug, channelSlug } = event.params;
    throw redirect(302, workspaceBasePath({ orgSlug, toolSlug, version, channelSlug }));
  }

  const user = await event.locals.getUser();
  const orgId = user?.organization?.id;

  // 채널/사용자 이름은 필터 드롭다운에 어차피 필요하다. 가져온 뒤 표에 붙이는 조인은 공짜다.
  //   이름을 로그 레코드에 스냅샷하지 않는 이유는 loadOrgMemberRoster 주석 참고
  // 둘 다 조직 범위여야 한다: 원장은 조직 전체를 담으므로 본인 것만 가져오면 남이 한 일의
  //   채널/행위자가 이름 없이 남는다(그 상태로 화면 전체가 "삭제된 채널" 로 보인 적이 있다)
  // 둘 중 하나가 실패해도 로그는 볼 수 있어야 하므로 각각 폴백한다(이름만 빠진다)
  const [channelRoster, members] = await Promise.all([
    loadOrgChannelRoster(orgId),
    loadOrgMemberRoster(event)
  ]);

  // 표시 이름을 여기서 확정한다. 채널 이름은 주인 안에서만 유일해서 조직 전체 목록에는 같은
  //   이름이 여럿 있고(모두가 '기본' 채널을 갖는다), 그것을 갈라 주려면 멤버 로스터가 필요하다.
  //   표와 필터, CSV 가 모두 이 목록 하나만 소비하므로 규칙이 한 곳에만 있다.
  const channels = toChannelFilterOptions(channelRoster, createMemberIdentityLookup(members));

  return { channels, members };
};