// 하드웨어 상세 BFF: csc-control-tower `GET /platform/servers/:id/hardware` 로 중계(ROOT 전용)
import type { RequestEvent } from '@sveltejs/kit';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, mapHttpError, requireAuth } from '$lib/server/http/bff';
import type { HardwareInfo } from '$lib/features/server-monitoring/types';

export async function GET(event: RequestEvent) {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  const id = event.params.id ?? '';
  try {
    const res = await authControlClient(event).GET<HardwareInfo>(
      `/platform/servers/${encodeURIComponent(id)}/hardware`,
    );
    return ok(res.data);
  } catch (error) {
    return mapHttpError(error, {
      fallback: '하드웨어 정보를 불러오지 못했습니다.',
      log: 'Server hardware fetch failed'
    });
  }
}
