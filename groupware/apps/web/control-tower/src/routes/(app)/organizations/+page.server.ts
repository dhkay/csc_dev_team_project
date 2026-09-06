import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import { hasAdminFeature } from '$lib/shared/lib/auth/platform';
import { withOrgLogoUrl } from '$lib/server/organizations/orgView';
import type { OrganizationSummary } from '$lib/features/organizations/types';

// 조직 목록 로드: csc-control-tower `GET /platform/organizations`(→ user 서버) 실데이터
export const load: PageServerLoad = async (event) => {
  // 접근 차단: ROOT 또는 'org-management' 옵션을 가진 관리자만. (사이드바와 동일 기준)
  if (!hasAdminFeature(await event.locals.getUser(), 'org-management')) {
    throw redirect(302, '/');
  }
  try {
    const res = await authControlClient(event).GET<OrganizationSummary[]>(
      '/platform/organizations',
    );
    // 로고 uploadId → 표시용 서명 URL 변환(스토리지는 uploadId 저장, 표시는 렌더 시 서명)
    return { organizations: (res.data ?? []).map(withOrgLogoUrl) };
  } catch (e) {
    console.error('조직 목록 조회 실패:', e instanceof Error ? e.message : 'unknown');
    return { organizations: [] as OrganizationSummary[], loadError: true };
  }
};
