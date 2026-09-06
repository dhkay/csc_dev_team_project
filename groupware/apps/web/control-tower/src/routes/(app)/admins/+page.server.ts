import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import { isPlatformRoot } from '$lib/shared/lib/auth/platform';
import type { AdminSummary } from '$lib/features/admins/types';

// 관리자 관리: ROOT 전용. 목록을 csc-control-tower(→ user)에서 SSR 로 가져온다.
// 옵션 카탈로그는 추가/상세 팝아웃이 각자 로드한다.
export const load: PageServerLoad = async (event) => {
  // 접근 차단: 플랫폼 ROOT 만. (사이드바 rootOnly 와 동일 기준: 직접 URL 접근도 차단)
  if (!isPlatformRoot(await event.locals.getUser())) {
    throw redirect(302, '/');
  }
  try {
    const res = await authControlClient(event).GET<AdminSummary[]>('/platform/admins');
    return { admins: res.data ?? [] };
  } catch (e) {
    console.error('관리자 목록 조회 실패:', e instanceof Error ? e.message : 'unknown');
    return { admins: [] as AdminSummary[], loadError: true };
  }
};
