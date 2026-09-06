// 리소스 점유 상위 프로세스 BFF: csc-control-tower `GET /platform/servers/:id/top` 로 중계(ROOT 전용)
import type { RequestEvent } from '@sveltejs/kit';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, mapHttpError, requireAuth } from '$lib/server/http/bff';
import type { ProcessUsage } from '$lib/features/server-monitoring/types';

export async function GET(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  const id = event.params.id ?? '';
  const resource = event.url.searchParams.get('resource') ?? 'cpu';
  const limit = event.url.searchParams.get('limit') ?? '8';
  try {
    const res = await authControlClient(event).GET<ProcessUsage[]>(
      `/platform/servers/${encodeURIComponent(id)}/top?resource=${encodeURIComponent(resource)}&limit=${encodeURIComponent(limit)}`,
    );
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '프로세스 정보를 불러오지 못했습니다.',
      log: 'Server top fetch failed'
    });
  }
}
