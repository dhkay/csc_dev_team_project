// 조직 멤버 로스터 SSR 로드: 화면이 사용자 id 를 이름으로 조인할 때 쓴다(활동 로그 행위자, 보관함 소유자)
// 이름 조회 규칙 자체는 클라이언트도 쓰므로 $lib/features/members/lib/roster 가 소유하고, 여기선 적재만 한다.
import type { RequestEvent } from '@sveltejs/kit';
import { authUserClient } from '$lib/infrastructure/http/serverClientInstances';
import { softLoad } from '$lib/server/http/softLoad';
import type { MemberRosterEntry } from '$lib/features/members/lib/roster';
import type { MemberSummary } from '$lib/features/members/types';

/**
 * 조직 멤버 목록을 (id, 이름, 이메일)만 남겨 가져온다. 세션 조직 스코프는 user 서버가 토큰으로 강제한다.
 * 이메일까지 나르는 이유는 roster.ts 주석 참고(이름은 동명이인 허용 → 이메일로 사람을 갈라준다)
 *
 * 실패해도 빈 배열로 폴백한다: 이름은 표시용 보조 정보라, 로스터를 못 가져왔다고 로그나
 * 보관함 자체가 안 뜨면 안 된다(이름 대신 `알 수 없는 사용자 (#id)` 가 보일 뿐)
 * 폴백을 조용히 하지 않는 이유는 softLoad 주석 참고
 */
export function loadOrgMemberRoster(event: RequestEvent): Promise<MemberRosterEntry[]> {
  return softLoad(
    '조직 멤버 로스터',
    async () => {
      const res = await authUserClient(event).GET<MemberSummary[]>('/user-api/org/members');
      return (res.data ?? []).map((m) => ({ id: m.id, name: m.name, email: m.email }));
    },
    []
  );
}