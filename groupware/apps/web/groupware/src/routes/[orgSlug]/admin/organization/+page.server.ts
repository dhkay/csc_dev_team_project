import { redirect } from '@sveltejs/kit';
import { canManageOrg, hasRootAuthority } from '$lib/shared/lib/auth/access';
import { authUserClient } from '$lib/infrastructure/http/serverClientInstances';
import type { MemberSummary } from '$lib/features/members/types';
import type { Department } from '$lib/features/departments/types';
import type { PermissionGrantMatrix } from '$lib/features/permissions/types';
import type { AiToolDistributionMatrix } from '$lib/features/ai-tool-distribution/types';
import type { PageServerLoad } from './$types';

const EMPTY_GRANTS: PermissionGrantMatrix = { departments: [], members: [] };
const EMPTY_DISTRIBUTION: AiToolDistributionMatrix = {
  tools: [],
  departmentGrants: [],
  memberGrants: [],
};

/**
 * /[orgSlug]/admin/organization 가드 + 데이터(조직도)
 *
 * 상위 admin 레이아웃이 isAdmin(ROOT/ADMIN) + slug 일치를 이미 검증한다. 조직 관리는
 * ROOT 또는 시스템관리 권한 보유자 전용이므로 여기서 canManageOrg 가드를 추가한다. 부서 트리 +
 * 조직 멤버를 user 서버에서 조직 범위로 조회한다(조직은 토큰에서 도출). 기업명은 레이아웃 user.organization.
 */
export const load: PageServerLoad = async (event) => {
  const user = await event.locals.getUser();
  if (!canManageOrg(user)) {
    throw redirect(302, `/${event.params.orgSlug}/admin`);
  }
  try {
    const client = authUserClient(event);
    const [deptRes, membersRes, grantsRes, distRes] = await Promise.all([
      client.GET<Department[]>('/user-api/org/departments'),
      client.GET<MemberSummary[]>('/user-api/org/members'),
      client.GET<PermissionGrantMatrix>('/user-api/org/permissions/grants'),
      client.GET<AiToolDistributionMatrix>('/user-api/org/ai-tools/distribution'),
    ]);
    return {
      departments: deptRes.data ?? [],
      members: membersRes.data ?? [],
      grantMatrix: grantsRes.data ?? EMPTY_GRANTS,
      aiToolDistribution: distRes.data ?? EMPTY_DISTRIBUTION,
      // 루트 권한자(ROOT/대표)면 시스템관리 부여 가능. 대표 임명은 ROOT(개발관리자)만. 패널 게이팅
      hasRootAuthority: hasRootAuthority(user),
      isRootRole: user?.role === 'ROOT',
      loadError: false,
    };
  } catch (e) {
    console.error('조직도/멤버 조회 실패:', e instanceof Error ? e.message : 'unknown');
    return {
      departments: [] as Department[],
      members: [] as MemberSummary[],
      grantMatrix: EMPTY_GRANTS,
      aiToolDistribution: EMPTY_DISTRIBUTION,
      hasRootAuthority: hasRootAuthority(user),
      isRootRole: user?.role === 'ROOT',
      loadError: true,
    };
  }
};
