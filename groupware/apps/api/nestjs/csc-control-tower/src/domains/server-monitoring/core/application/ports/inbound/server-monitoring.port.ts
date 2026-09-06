import { ServerMeta } from '../../../domain/server.types';
import {
  HardwareInfo,
  ProcessUsage,
  ServerWithStatus,
} from '../../../domain/metrics.types';

/** 서버 모니터링 Inbound Port. */
export interface ServerMonitoringPort {
  /** 등록된 서버 메타 목록(정적, baseUrl 미노출) */
  listServers(): ServerMeta[];
  /** 전 호스트 지표 스냅샷을 팬아웃 수집(호스트별 실패는 offline) */
  getServersMetrics(): Promise<ServerWithStatus[]>;
  /** 특정 호스트의 리소스(cpu|ram|gpu|vram) 점유 상위 프로세스(on-demand) */
  getServerTop(serverId: string, resource: string, limit: number): Promise<ProcessUsage[]>;
  /** 특정 호스트의 정적 하드웨어 상세(on-demand) */
  getServerHardware(serverId: string): Promise<HardwareInfo>;
}

export const SERVER_MONITORING_PORT = Symbol('SERVER_MONITORING_PORT');
