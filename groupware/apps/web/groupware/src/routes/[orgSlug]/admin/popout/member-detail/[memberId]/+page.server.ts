import { error, redirect } from '@sveltejs/kit';
import { canManageOrg } from '$lib/shared/lib/auth/access';
import { authUserClient } from '$lib/infrastructure/http/serverClientInstances';
import type { MemberSummary } from '$lib/features/members/types';
import type { Department } from '$lib/features/departments/types';
import type { PageServerLoad } from './$types';

// 일반관리자 상세 팝아웃 로드: 조직 관리 가능자(ROOT/시스템관리) 전용. 목록에서 memberId 로 찾는다(ADMIN 만)
// (user 서버에 단건 조회 엔드포인트가 없어 control-tower admins 와 동일하게 목록에서 찾는다.)
export const load: PageServerLoad = async (event) => {
  if (!canManageOrg(await event.locals.getUser())) {
    throw redirect(302, `/${event.params.orgSlug}/admin`);
  }

  const id = Number(event.params.memberId);
  if (!Number.isFinite(id)) throw error(404, '관리자를 찾을 수 없습니다.');

  const client = authUserClient(event);
  const [membersRes, deptRes] = await Promise.all([
    client.GET<MemberSummary[]>('/user-api/org/members'),
    client.GET<Department[]>('/user-api/org/departments'),
  ]);
  const member = (membersRes.data ?? []).find((m) => m.id === id && m.role === 'ADMIN');
  if (!member) throw error(404, '관리자를 찾을 수 없습니다.');

  return { member, departments: deptRes.data ?? [] };
};
