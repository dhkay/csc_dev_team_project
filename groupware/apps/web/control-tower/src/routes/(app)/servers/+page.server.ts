import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import { isPlatformRoot } from '$lib/shared/lib/auth/platform';
import type { ServerWithStatus } from '$lib/features/server-monitoring/types';

// 서버 모니터링: ROOT 전용. (app) 그룹 가드(isPlatformAdmin) 위에 ROOT 가드를 더한다.
// 초기 스냅샷 1회 로드 후, 브라우저에서 폴링 스토어가 실시간 갱신한다.
export const load: PageServerLoad = async (event) => {
  if (!isPlatformRoot(await event.locals.getUser())) {
    throw redirect(302, '/');
  }
  try {
    const res = await authControlClient(event).GET<ServerWithStatus[]>(
      '/platform/servers/metrics',
    );
    return { servers: res.data ?? [] };
  } catch (e) {
    console.error('서버 지표 초기 로드 실패:', e instanceof Error ? e.message : 'unknown');
    return { servers: [] as ServerWithStatus[], loadError: true };
  }
};
