// 서버 지표 스냅샷 BFF: csc-control-tower `GET /platform/servers/metrics` 로 중계(ROOT 전용)
// PlatformRootGuard(access 토큰) + ServiceTokenGuard 보호라 authControlClient 가 둘 다 첨부한다.
import type { RequestEvent } from '@sveltejs/kit';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, mapHttpError, requireAuth } from '$lib/server/http/bff';
import type { ServerWithStatus } from '$lib/features/server-monitoring/types';

export async function GET(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const res = await authControlClient(event).GET<ServerWithStatus[]>('/platform/servers/metrics');
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '서버 지표를 불러오지 못했습니다.',
      log: 'Server metrics fetch failed'
    });
  }
}
