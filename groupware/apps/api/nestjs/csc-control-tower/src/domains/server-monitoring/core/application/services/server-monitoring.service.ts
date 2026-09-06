import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ServerMonitoringPort } from '../ports/inbound/server-monitoring.port';
import {
  SERVER_REGISTRY_PORT,
  ServerRegistryPort,
} from '../ports/outbound/server-registry.port';
import {
  METRICS_SOURCE_RESOLVER,
  MetricsSourceResolverPort,
} from '../ports/outbound/metrics-source.port';
import { ServerMeta } from '../../domain/server.types';
import {
  HardwareInfo,
  ProcessUsage,
  ServerWithStatus,
} from '../../domain/metrics.types';

const ALLOWED_RESOURCES = new Set(['cpu', 'ram', 'gpu', 'vram']);

/**
 * 서버 모니터링 서비스: 레지스트리의 각 호스트로 팬아웃해 스냅샷을 모은다.
 * 호스트별 실패/타임아웃은 offline 으로 격리하고 집계는 절대 throw 하지 않는다.
 * (죽은 호스트 하나가 그리드 전체를 비우지 않도록)
 */
@Injectable()
export class ServerMonitoringService implements ServerMonitoringPort {
  private readonly logger = new Logger(ServerMonitoringService.name);

  constructor(
    @Inject(SERVER_REGISTRY_PORT)
    private readonly registry: ServerRegistryPort,
    @Inject(METRICS_SOURCE_RESOLVER)
    private readonly resolver: MetricsSourceResolverPort,
  ) {}

  listServers(): ServerMeta[] {
    return this.registry.list().map((s) => ({ id: s.id, label: s.label, role: s.role }));
  }

  async getServersMetrics(): Promise<ServerWithStatus[]> {
    const servers = this.registry.list();
    const results = await Promise.allSettled(
      servers.map((s) => this.resolver.for(s.sourceType).fetchSnapshot(s)),
    );

    return servers.map((s, i) => {
      const r = results[i];
      if (r.status === 'fulfilled') {
        return { id: s.id, label: s.label, role: s.role, status: 'online', metrics: r.value };
      }
      this.logger.warn(
        `서버 '${s.id}' 지표 수집 실패(offline): ${
          r.reason instanceof Error ? r.reason.message : 'unknown'
        }`,
      );
      return { id: s.id, label: s.label, role: s.role, status: 'offline', metrics: null };
    });
  }

  async getServerTop(
    serverId: string,
    resource: string,
    limit: number,
  ): Promise<ProcessUsage[]> {
    if (!ALLOWED_RESOURCES.has(resource)) return [];
    const server = this.registry.list().find((s) => s.id === serverId);
    if (!server) {
      throw new NotFoundException(`알 수 없는 서버: ${serverId}`);
    }
    // on-demand 조회는 실패를 삼키지 않고 표면화한다. 빈 목록([])은 "정말 없음"만 의미하도록
    // (스냅샷 팬아웃과 달리, 여기선 에러를 감추면 "프로세스 없음"과 구분되지 않아 오해를 부른다.)
    return this.resolver.for(server.sourceType).fetchTop(server, resource, limit);
  }

  getServerHardware(serverId: string): Promise<HardwareInfo> {
    const server = this.registry.list().find((s) => s.id === serverId);
    if (!server) {
      throw new NotFoundException(`알 수 없는 서버: ${serverId}`);
    }
    return this.resolver.for(server.sourceType).fetchHardware(server);
  }
}
