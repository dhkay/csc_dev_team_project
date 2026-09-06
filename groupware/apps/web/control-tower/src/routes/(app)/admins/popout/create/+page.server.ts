import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import { isPlatformRoot } from '$lib/shared/lib/auth/platform';
import type { AdminFeatureCatalogItem } from '$lib/features/admins/types';

// 관리자 추가 팝아웃 로드: ROOT 전용. 옵션 카탈로그를 내려준다.
export const load: PageServerLoad = async (event) => {
  if (!isPlatformRoot(await event.locals.getUser())) throw redirect(302, '/');
  try {
    const res = await authControlClient(event).GET<AdminFeatureCatalogItem[]>('/platform/admin-features');
    return { catalog: res.data ?? [] };
  } catch (e) {
    console.error('옵션 카탈로그 조회 실패:', e instanceof Error ? e.message : 'unknown');
    throw error(500, '옵션 카탈로그를 불러오지 못했습니다.');
  }
};
