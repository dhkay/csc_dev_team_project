// 서버 지표 데이터 접근 (브라우저): 같은 origin BFF(/api/platform/servers/metrics)만 frontClient 로 호출
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type {
  HardwareInfo,
  ProcessUsage,
  ResourceKey,
  ServerWithStatus,
} from '../types';

type Envelope<T> = { success?: boolean; data?: T; error?: string };

/** 전 호스트 스냅샷 폴링. 실패 시 throw(폴링 스토어가 lastError 로 표시) */
export async function fetchServersMetrics(): Promise<ServerWithStatus[]> {
  const res = await frontClient().GET<Envelope<ServerWithStatus[]>>(
    ROUTES.PLATFORM.SERVERS_METRICS,
  );
  const body = res.data;
  if (!body?.success || !body.data) {
    throw new Error(body?.error ?? '서버 지표를 불러오지 못했습니다.');
  }
  return body.data;
}

/** 특정 서버의 리소스 점유 상위 프로세스(게이지 클릭 시) */
export async function fetchServerTop(
  serverId: string,
  resource: ResourceKey,
  limit = 8,
): Promise<ProcessUsage[]> {
  const url = `${ROUTES.PLATFORM.serverTop(serverId)}?resource=${resource}&limit=${limit}`;
  const res = await frontClient().GET<Envelope<ProcessUsage[]>>(url);
  const body = res.data;
  if (!body?.success || !body.data) {
    throw new Error(body?.error ?? '프로세스 정보를 불러오지 못했습니다.');
  }
  return body.data;
}

/** 특정 서버의 정적 하드웨어 상세(게이지 클릭 시) */
export async function fetchServerHardware(serverId: string): Promise<HardwareInfo> {
  const url = `${ROUTES.PLATFORM.serverHardware(serverId)}`;
  const res = await frontClient().GET<Envelope<HardwareInfo>>(url);
  const body = res.data;
  if (!body?.success || !body.data) {
    throw new Error(body?.error ?? '하드웨어 정보를 불러오지 못했습니다.');
  }
  return body.data;
}
