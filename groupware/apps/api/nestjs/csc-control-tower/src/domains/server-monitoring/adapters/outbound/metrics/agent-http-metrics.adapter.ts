import { Injectable } from '@nestjs/common';
import { MetricsSourcePort } from '../../../core/application/ports/outbound/metrics-source.port';
import { RegisteredServer } from '../../../core/domain/server.types';
import {
  HardwareInfo,
  HostSnapshot,
  ProcessUsage,
} from '../../../core/domain/metrics.types';
import { MetricsAgentClientFactory } from '../../../../../shared/adapters/outbound/metrics-agent';

/** MetricsSourcePort 구현(sourceType 'agent'): 호스트의 metrics-agent 를 HTTP 로 호출 */
@Injectable()
export class AgentHttpMetricsAdapter implements MetricsSourcePort {
  constructor(private readonly clientFactory: MetricsAgentClientFactory) {}

  fetchSnapshot(server: RegisteredServer): Promise<HostSnapshot> {
    return this.clientFactory
      .forBaseUrl(server.baseUrl)
      .get<HostSnapshot>('/metrics/snapshot');
  }

  fetchTop(server: RegisteredServer, resource: string, limit: number): Promise<ProcessUsage[]> {
    const qs = `resource=${encodeURIComponent(resource)}&limit=${limit}`;
    return this.clientFactory
      .forBaseUrl(server.baseUrl)
      .get<ProcessUsage[]>(`/metrics/top?${qs}`);
  }

  fetchHardware(server: RegisteredServer): Promise<HardwareInfo> {
    return this.clientFactory.forBaseUrl(server.baseUrl).get<HardwareInfo>('/metrics/hardware');
  }
}
