// 조직 디렉터리 SSR 로드: 부서 트리 + 멤버 목록을 한 번에 가져온다.
//
// `/user-api/org/directory` 는 모든 조직유저가 부를 수 있는 읽기 전용 슬라이스다.
// `/user-api/org/departments` 는 조직 관리 권한자 전용이라 일반 구성원 화면에서는 쓸 수 없다.
// 그래서 부서 트리가 필요한 곳(스토리지 좌측 nav)은 이쪽을 쓴다.
//
// 실패해도 빈 목록으로 폴백한다. 부서 정보는 화면 구성을 돕는 값이라, 못 가져왔다고 파일 목록
// 자체가 안 뜨면 안 된다. 폴백을 조용히 하지 않는 이유는 softLoad 주석 참고
import type { RequestEvent } from '@sveltejs/kit';
import { authUserClient } from '$lib/infrastructure/http/serverClientInstances';
import { softLoad } from '$lib/server/http/softLoad';
import type { Department } from '$lib/features/departments/types';
import type { MemberSummary } from '$lib/features/members/types';

export interface OrgDirectory {
  members: MemberSummary[];
  departments: Department[];
}

const EMPTY: OrgDirectory = { members: [], departments: [] };

/**
 * 조직 단위 짧은 캐시
 *
 * 이 응답은 조직 전체가 같은 값이다(부서 트리와 멤버 목록). 사용자마다 다른 것은 그 안에서
 * 자기 자신을 찾는 부분뿐이라 조직 하나당 한 벌만 두면 된다.
 *
 * 캐시가 없으면 파일 목록을 한 번 볼 때마다 user 서버 왕복이 하나 더 붙는다. 대가는 최대 30초의
 * 낡음이다. 부서를 옮기거나 멤버를 더한 직후 그만큼은 예전 값으로 보인다. 인가에 쓰이는 값이라
 * 이 창을 길게 잡지 않는다(권한을 회수한 뒤에도 그 시간만큼은 통한다는 뜻이므로)
 */
const TTL_MS = 30_000;
const cache = new Map<number, { at: number; value: OrgDirectory }>();

async function fetchDirectory(event: RequestEvent): Promise<OrgDirectory> {
  return softLoad(
    '조직 디렉터리',
    async () => {
      // includeRoot: 이 응답은 화면에 직원 목록을 그리는 용도가 아니라 id 를 이름으로 바꾸는
      //   용도다. 기본 응답은 조직 소유자를 빼는데(직원조회 화면의 규칙), 그러면 소유자가 올린
      //   파일의 "올린 사람" 이 `알 수 없는 사용자 (#id)` 로 나온다. 실제로 그렇게 보였다.
      const res = await authUserClient(event).GET<OrgDirectory>(
        '/user-api/org/directory?includeRoot=true'
      );
      return {
        members: res.data?.members ?? [],
        departments: res.data?.departments ?? []
      };
    },
    EMPTY
  );
}

export async function loadOrgDirectory(
  event: RequestEvent,
  organizationId: number
): Promise<OrgDirectory> {
  const hit = cache.get(organizationId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await fetchDirectory(event);
  // 조회 실패(빈 폴백)는 캐시하지 않는다. 다음 요청이 다시 시도해야 한다.
  if (value.members.length > 0 || value.departments.length > 0) {
    cache.set(organizationId, { at: Date.now(), value });
  }
  return value;
}
