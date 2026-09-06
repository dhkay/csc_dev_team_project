import { RegisteredServer, SourceType } from '../../../domain/server.types';
import { HardwareInfo, HostSnapshot, ProcessUsage } from '../../../domain/metrics.types';

/**
 * 지표 소스 Outbound Port: 확장 seam.
 * 신규 소스(cloudwatch/prometheus) = 이 Port 구현 어댑터 + resolver 한 줄. 서비스/레지스트리 무변경
 */
export interface MetricsSourcePort {
  fetchSnapshot(server: RegisteredServer): Promise<HostSnapshot>;
  fetchTop(server: RegisteredServer, resource: string, limit: number): Promise<ProcessUsage[]>;
  fetchHardware(server: RegisteredServer): Promise<HardwareInfo>;
}

/** sourceType → MetricsSourcePort 매핑 */
export interface MetricsSourceResolverPort {
  for(sourceType: SourceType): MetricsSourcePort;
}

export const METRICS_SOURCE_RESOLVER = Symbol('METRICS_SOURCE_RESOLVER');
