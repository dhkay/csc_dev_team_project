import { redirect } from '@sveltejs/kit';
import { canManageOrg } from '$lib/shared/lib/auth/access';
import { authUserClient } from '$lib/infrastructure/http/serverClientInstances';
import type { Department } from '$lib/features/departments/types';
import type { PageServerLoad } from './$types';

// 일반관리자 추가 팝아웃 가드: 조직 관리 가능자(ROOT/시스템관리) 전용(상위 admin 레이아웃은 ADMIN 까지 허용하므로 재검증)
// 소속 셀렉터용 부서 목록을 함께 내려준다.
export const load: PageServerLoad = async (event) => {
  if (!canManageOrg(await event.locals.getUser())) {
    throw redirect(302, `/${event.params.orgSlug}/admin`);
  }
  try {
    const res = await authUserClient(event).GET<Department[]>('/user-api/org/departments');
    return { departments: res.data ?? [] };
  } catch {
    return { departments: [] as Department[] };
  }
};
