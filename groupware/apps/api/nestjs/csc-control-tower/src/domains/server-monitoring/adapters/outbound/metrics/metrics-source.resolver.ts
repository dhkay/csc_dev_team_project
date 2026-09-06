import { Injectable } from '@nestjs/common';
import {
  MetricsSourcePort,
  MetricsSourceResolverPort,
} from '../../../core/application/ports/outbound/metrics-source.port';
import { SourceType } from '../../../core/domain/server.types';
import { AgentHttpMetricsAdapter } from './agent-http-metrics.adapter';

/**
 * sourceType → MetricsSourcePort 해석기(확장 seam)
 * 신규 소스(cloudwatch/prometheus) 도입 = 어댑터 주입 + 아래 switch 한 줄
 */
@Injectable()
export class MetricsSourceResolver implements MetricsSourceResolverPort {
  constructor(private readonly agent: AgentHttpMetricsAdapter) {}

  for(sourceType: SourceType): MetricsSourcePort {
    switch (sourceType) {
      case 'agent':
        return this.agent;
      default:
        throw new Error(`지원하지 않는 metrics sourceType: ${sourceType}`);
    }
  }
}
