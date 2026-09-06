import { Injectable } from '@nestjs/common';
import { NestServiceClient } from '@csc/net-utils/nest';
import { MetricsAgentTokenService } from './metrics-agent-token.service';

/**
 * 동적 다중 호스트용 metrics-agent 클라이언트 팩토리
 *
 * 호스트가 env 마다 1..N 개라 타깃별 고정 클라이언트를 둘 수 없다. baseUrl 별로 캐시해
 * "호출마다 새 클라이언트 금지" 규칙을 지킨다. 짧은 timeout 은 죽은 호스트를 빠르게 offline 으로 떨어뜨린다.
 */
@Injectable()
export class MetricsAgentClientFactory {
  private readonly cache = new Map<string, NestServiceClient>();

  constructor(private readonly token: MetricsAgentTokenService) {}

  forBaseUrl(baseUrl: string): NestServiceClient {
    let client = this.cache.get(baseUrl);
    if (!client) {
      client = new NestServiceClient({
        baseUrl,
        serviceToken: () => this.token.createServiceToken(),
        timeoutMs: 2500,
      });
      this.cache.set(baseUrl, client);
    }
    return client;
  }
}
