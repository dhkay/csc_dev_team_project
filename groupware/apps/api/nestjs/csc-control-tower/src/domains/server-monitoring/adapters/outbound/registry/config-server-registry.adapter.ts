import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServerRegistryPort } from '../../../core/application/ports/outbound/server-registry.port';
import { RegisteredServer } from '../../../core/domain/server.types';

/**
 * 환경별 호스트 레지스트리(config 주도)
 *
 * SERVER_REGISTRY_JSON 이 있으면 그대로 쓴다. AWS EC2 등은 여기에 append 하면 되고 코드는
 * 바꾸지 않는다. 없으면 APP_ENV 별 코드 기본값으로 떨어진다.
 */
@Injectable()
export class ConfigServerRegistryAdapter implements ServerRegistryPort {
  private readonly logger = new Logger(ConfigServerRegistryAdapter.name);
  private readonly servers: RegisteredServer[];

  constructor(private readonly config: ConfigService) {
    this.servers = this.build();
  }

  list(): RegisteredServer[] {
    return this.servers;
  }

  private build(): RegisteredServer[] {
    const json = this.config.get<string>('SERVER_REGISTRY_JSON');
    if (json && json.trim()) {
      try {
        const parsed = JSON.parse(json) as RegisteredServer[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        this.logger.warn('SERVER_REGISTRY_JSON 파싱 실패: env 기본값으로 폴백합니다.');
      }
    }

    const env = this.resolveEnv();
    if (env === 'staging' || env === 'prod') {
      return [
        {
          id: `${env}-web`,
          label: `Web Server (${env})`,
          role: 'web',
          sourceType: 'agent',
          baseUrl:
            this.config.get<string>('METRICS_AGENT_WEB_URL') ?? 'http://metrics-agent:8000',
        },
        {
          id: `${env}-ai`,
          label: `AI Server (${env})`,
          role: 'ai',
          sourceType: 'agent',
          baseUrl: this.config.get<string>('METRICS_AGENT_AI_URL') ?? '',
        },
      ];
    }

    // dev: 단일 PC(GPU 포함)
    return [
      {
        id: 'dev-local',
        label: 'Local PC',
        role: 'all',
        sourceType: 'agent',
        baseUrl:
          this.config.get<string>('METRICS_AGENT_ALL_URL') ?? 'http://localhost:8090',
      },
    ];
  }

  /** APP_ENV 우선, 없으면 NODE_ENV 로부터 유도(production→prod) */
  private resolveEnv(): 'dev' | 'staging' | 'prod' {
    const raw = (
      this.config.get<string>('APP_ENV') ??
      process.env.NODE_ENV ??
      'dev'
    ).toLowerCase();
    if (raw === 'staging') return 'staging';
    if (raw === 'prod' || raw === 'production') return 'prod';
    return 'dev';
  }
}
