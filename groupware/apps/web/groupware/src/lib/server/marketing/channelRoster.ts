// 조직 채널 로스터 SSR 로드: 화면이 채널 id 를 이름으로 조인할 때 쓴다(활동 로그의 채널 컬럼/필터)
// 표시 규칙(같은 이름을 주인으로 갈라주기)은 클라이언트도 쓸 수 있게
// $lib/features/marketing-activity-logs/lib/channelOptions 가 소유하고, 여긴 적재만 한다.
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { softLoad } from '$lib/server/http/softLoad';
import type { ChannelRosterEntry } from '$lib/features/marketing-activity-logs/lib/channelOptions';

/**
 * 조직에 있는 모든 채널의 (id, 이름, 주인)을 가져온다.
 *
 * 채널 목록(`GET /channels`)을 쓰지 않는 이유: 그쪽은 주인 것만 돌려준다(채널이 개인 소유가 된
 * 뒤로). 조직 전체 원장은 남이 만든 채널의 id 도 담으므로 그것으로는 이름을 풀 수 없다.
 *
 * 호출부에 권한 게이트가 있어야 한다. 이 응답은 조직 전체의 채널 이름과 주인 id 를 담아,
 * 멤버 로스터와 합치면 "누가 어떤 채널을 갖고 있나" 가 된다. 개인 소유 자원의 목록이므로 아무
 * 조직원에게나 열 값이 아니다. 현재 유일한 호출부(활동 로그 로더)는 `canViewLogs`(관리급 =
 * 루트/대표/팀장) 뒤에 있다. 다른 화면에서 쓸 때 그 화면의 열람 범위를 먼저 정하고 붙인다.
 *
 * 실패하면 빈 배열로 접는다(이름 없이라도 로그는 보여야 한다). 조용히 접지 않는 이유는 softLoad
 * 주석에 있다. 이 조회가 침묵한 채 실패해 원장 전체가 `삭제된 채널` 로 보인 것이 그 사례다.
 */
export function loadOrgChannelRoster(
  organizationId: number | undefined
): Promise<ChannelRosterEntry[]> {
  if (organizationId == null) return Promise.resolve([]);
  return softLoad(
    '조직 채널 로스터',
    async () => {
      const res = await serverMarketingClient().GET<ChannelRosterEntry[]>(
        `/channels/roster?organizationId=${organizationId}`
      );
      return res.data ?? [];
    },
    []
  );
}