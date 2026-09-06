import { Module } from '@nestjs/common';
import { PlatformRootGuard } from '../../shared/guards';
import {
  MetricsAgentClientFactory,
  MetricsAgentTokenService,
} from '../../shared/adapters/outbound/metrics-agent';
import { ServerMonitoringController } from './adapters/inbound/http/controllers/server-monitoring.controller';
import { ConfigServerRegistryAdapter } from './adapters/outbound/registry/config-server-registry.adapter';
import { AgentHttpMetricsAdapter } from './adapters/outbound/metrics/agent-http-metrics.adapter';
import { MetricsSourceResolver } from './adapters/outbound/metrics/metrics-source.resolver';
import { ServerMonitoringService } from './core/application/services/server-monitoring.service';
import { SERVER_MONITORING_PORT } from './core/application/ports/inbound/server-monitoring.port';
import { SERVER_REGISTRY_PORT } from './core/application/ports/outbound/server-registry.port';
import { METRICS_SOURCE_RESOLVER } from './core/application/ports/outbound/metrics-source.port';

/**
 * 서버 모니터링 도메인: 환경별 레지스트리의 각 호스트 metrics-agent 로 팬아웃해 지표를 모은다.
 * 확장 seam: 새 지표 소스(cloudwatch/prometheus) = MetricsSourcePort 어댑터 + resolver 한 줄
 */
@Module({
  controllers: [ServerMonitoringController],
  providers: [
    { provide: SERVER_MONITORING_PORT, useClass: ServerMonitoringService },
    { provide: SERVER_REGISTRY_PORT, useClass: ConfigServerRegistryAdapter },
    { provide: METRICS_SOURCE_RESOLVER, useClass: MetricsSourceResolver },
    AgentHttpMetricsAdapter,
    MetricsAgentClientFactory,
    MetricsAgentTokenService,
    PlatformRootGuard,
  ],
})
export class ServerMonitoringModule {}
