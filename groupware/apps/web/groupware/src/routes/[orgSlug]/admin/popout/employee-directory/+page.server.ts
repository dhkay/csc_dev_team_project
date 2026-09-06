import { authUserClient } from '$lib/infrastructure/http/serverClientInstances';
import type { MemberSummary } from '$lib/features/members/types';
import type { Department } from '$lib/features/departments/types';
import type { PageServerLoad } from './$types';

// 직원조회 팝아웃 로드: 상위 [orgSlug]/admin/+layout.server.ts 가드(isAdmin=ROOT+ADMIN)가 함께 실행되므로
// 추가 역할 가드 없이 조직 디렉터리(멤버+부서)를 조회한다(읽기 전용, 같은 조직 조직유저면 user 서버가 허용)
interface DirectoryResponse {
  members: MemberSummary[];
  departments: Department[];
}

export const load: PageServerLoad = async (event) => {
  const user = await event.locals.getUser();
  const orgName = user?.organization?.name ?? '';
  try {
    const res = await authUserClient(event).GET<DirectoryResponse>('/user-api/org/directory');
    return {
      members: res.data?.members ?? [],
      departments: res.data?.departments ?? [],
      orgName,
      loadError: false,
    };
  } catch (e) {
    console.error('직원조회 디렉터리 조회 실패:', e instanceof Error ? e.message : 'unknown');
    return {
      members: [] as MemberSummary[],
      departments: [] as Department[],
      orgName,
      loadError: true,
    };
  }
};
