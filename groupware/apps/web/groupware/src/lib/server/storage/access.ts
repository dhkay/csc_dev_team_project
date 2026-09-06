// 스토리지 접근 범위 도출(서버 전용): 세션 + 조직 디렉터리 → "무엇을 볼 수 있는가".
//
// 판정은 여기 한 곳에서만 한다. file-upload 는 부서 트리를 해석하지 않고 팀장이 무엇인지도
// 모른다. 그 서버는 여기서 보낸 집합에 대한 소속만 검사한다(집행). 판정이 여러 곳에 흩어지면
// 한 라우트의 실수가 곧 다른 부서 파일 열람이 된다.
//
// 조회 비용은 두 단으로 나눈다. 신원(조직, 사용자, 관리 권한, 팀장 여부)은 세션만으로 알 수
// 있고, 부서 범위는 조직 디렉터리를 읽어야 안다. 공통과 개인 영역은 부서를 쓰지 않으므로
// 그 요청에서는 디렉터리를 부르지 않는다(파일 목록을 볼 때마다 왕복이 하나 줄어든다)
import type { RequestEvent } from '@sveltejs/kit';
import { OrgPosition } from '@csc/entitlements';
import { canManageOrg } from '$lib/shared/lib/auth/access';
import { fail, requireAuth } from '$lib/server/http/bff';
import { loadOrgDirectory } from '$lib/server/org/directory';
import { departmentSubtreeIds } from '$lib/features/storage/lib/tree';
import type { MemberRosterEntry } from '$lib/features/members/lib/roster';
import type { Department } from '$lib/features/departments/types';

/** 세션만으로 아는 값. 디렉터리 조회가 필요 없다. */
export interface StorageIdentity {
  orgId: number;
  userId: number;
  // ROOT, 대표, 시스템관리 권한자. 전 부서 접근을 뜻하는 유일한 값
  canManage: boolean;
  isTeamLeader: boolean;
}

/** 신원 + 부서 범위. 조직 디렉터리를 읽어야 채워진다. */
export interface StorageAccess extends StorageIdentity {
  // 본인 소속 부서. 미배치면 null(조직 영역이 비어 보인다)
  departmentId: number | null;
  // 접근 가능한 부서 id. canManage 면 전 부서, 팀장이면 자기 부서와 하위, 아니면 자기 부서
  accessibleDepartmentIds: number[];
  departments: Department[];
  roster: MemberRosterEntry[];
}

// 한 요청이 페이지 로드와 BFF 핸들러 여럿을 거쳐도 도출은 한 번이면 된다.
// RequestEvent 는 요청마다 새로 만들어지고 끝나면 버려지므로 WeakMap 이 알아서 빈다.
const identityCache = new WeakMap<RequestEvent, Promise<StorageIdentity>>();
const accessCache = new WeakMap<RequestEvent, Promise<StorageAccess>>();

async function deriveIdentity(event: RequestEvent): Promise<StorageIdentity> {
  const user = await event.locals.getUser();
  return {
    orgId: user?.organization?.id ?? 0,
    userId: event.locals.userId ?? 0,
    canManage: canManageOrg(user),
    isTeamLeader: user?.position === OrgPosition.TeamLeader
  };
}

function loadStorageIdentity(event: RequestEvent): Promise<StorageIdentity> {
  const cached = identityCache.get(event);
  if (cached) return cached;
  const pending = deriveIdentity(event);
  identityCache.set(event, pending);
  return pending;
}

async function deriveAccess(event: RequestEvent): Promise<StorageAccess> {
  const identity = await loadStorageIdentity(event);
  const { members, departments } = await loadOrgDirectory(event, identity.orgId);
  const roster: MemberRosterEntry[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email
  }));
  // 세션(getUser)에는 소속 부서가 없다. 디렉터리에서 자기 자신을 찾아야 알 수 있다.
  //   단 `members` 는 ROOT 를 제외하므로 ROOT 는 여기서 자기를 찾지 못한다. 그래도 아래에서
  //   canManage 가 먼저 전 부서를 주므로 조직 영역이 비어 보이지 않는다.
  const departmentId =
    members.find((m) => m.id === identity.userId)?.departmentId ?? null;

  // 규칙은 분기가 아니라 OR 다. 팀장이 시스템관리 권한을 함께 가질 수 있으므로 넓은 쪽이 이긴다.
  let accessibleDepartmentIds: number[] = [];
  if (identity.canManage) {
    accessibleDepartmentIds = departments.map((d) => d.id);
  } else if (departmentId !== null) {
    accessibleDepartmentIds = identity.isTeamLeader
      ? departmentSubtreeIds(departments, departmentId)
      : [departmentId];
  }

  return {
    ...identity,
    departmentId,
    accessibleDepartmentIds,
    departments,
    roster
  };
}

/** 부서 범위까지 필요한 곳에서 부른다(조직 영역, 사용량, 페이지 로드) */
export function loadStorageAccess(event: RequestEvent): Promise<StorageAccess> {
  const cached = accessCache.get(event);
  if (cached) return cached;
  const pending = deriveAccess(event);
  accessCache.set(event, pending);
  return pending;
}

function guard(identity: StorageIdentity): Response | null {
  if (!identity.orgId) {
    return fail('조직 정보를 확인할 수 없습니다.', { status: 403 });
  }
  if (!identity.userId) {
    return fail('사용자 정보를 확인할 수 없습니다.', { status: 401 });
  }
  return null;
}

/** BFF 가드(신원만): 부서를 쓰지 않는 요청용. 디렉터리를 부르지 않는다. */
export async function requireStorageIdentity(
  event: RequestEvent
): Promise<{ identity: StorageIdentity } | { error: Response }> {
  const authErr = requireAuth(event);
  if (authErr) return { error: authErr };
  const identity = await loadStorageIdentity(event);
  const denied = guard(identity);
  return denied ? { error: denied } : { identity };
}

/**
 * BFF 가드(부서 범위 포함). 실패면 에러 Response 를 담아 돌려준다.
 * (marketing/bff.ts 의 requireOrgUser 와 같은 모양이라 호출부가 낯설지 않다.)
 */
export async function requireStorageAccess(
  event: RequestEvent
): Promise<{ access: StorageAccess } | { error: Response }> {
  const authErr = requireAuth(event);
  if (authErr) return { error: authErr };
  const access = await loadStorageAccess(event);
  const denied = guard(access);
  return denied ? { error: denied } : { access };
}
