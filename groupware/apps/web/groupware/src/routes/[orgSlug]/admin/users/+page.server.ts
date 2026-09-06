import { redirect } from '@sveltejs/kit';
import { canManageOrg } from '$lib/shared/lib/auth/access';
import { authUserClient } from '$lib/infrastructure/http/serverClientInstances';
import type { MemberSummary } from '$lib/features/members/types';
import type { Department } from '$lib/features/departments/types';
import type { PageServerLoad } from './$types';

/**
 * /[orgSlug]/admin/users 가드 + 데이터
 *
 * 상위 admin 레이아웃이 isAdmin(ROOT/ADMIN) + slug 일치를 이미 검증한다. 사용자 관리는
 * ROOT 또는 시스템관리 권한 보유자 전용이므로 여기서 canManageOrg 가드를 추가한다(타일 숨김은 UX일 뿐,
 * URL 직접 접근 차단은 서버 가드 책임). 목록은 user 서버에서 조직 범위로 조회한다(조직은 토큰에서 도출)
 */
export const load: PageServerLoad = async (event) => {
  const user = await event.locals.getUser();
  if (!canManageOrg(user)) {
    throw redirect(302, `/${event.params.orgSlug}/admin`);
  }

  try {
    const client = authUserClient(event);
    // 활성 멤버 + 부서 + 삭제(탈퇴)된 멤버(단계적 삭제 2단계 화면용) 병렬 조회
    const [membersRes, deptRes, withdrawnRes] = await Promise.all([
      client.GET<MemberSummary[]>('/user-api/org/members'),
      client.GET<Department[]>('/user-api/org/departments'),
      client.GET<MemberSummary[]>('/user-api/org/members/withdrawn'),
    ]);
    return {
      members: membersRes.data ?? [],
      departments: deptRes.data ?? [],
      withdrawnMembers: withdrawnRes.data ?? [],
      loadError: false,
    };
  } catch (e) {
    console.error('조직 멤버/부서 조회 실패:', e instanceof Error ? e.message : 'unknown');
    return {
      members: [] as MemberSummary[],
      departments: [] as Department[],
      withdrawnMembers: [] as MemberSummary[],
      loadError: true,
    };
  }
};
