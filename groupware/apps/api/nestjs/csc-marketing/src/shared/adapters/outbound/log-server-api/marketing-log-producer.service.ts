import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestLogProducer } from '@csc/log-client/nest';
import type { LogEnvelopeWire } from '@csc/log-contracts';
import { LogServerApiClientService } from './log-server-api-client.service';

/**
 * 이 앱의 로그 프로듀서 싱글톤: 버퍼 + 주기 flush + 종료 드레인
 *
 * 반드시 하나여야 함. 도메인 모듈마다 provider 를 두면 버퍼와 타이머가 그 수만큼 생겨
 * 배포마다 여러 벌의 마지막 버퍼를 잃는다. body 의 service 는 서버가 서비스토큰 클레임으로 덮어씀
 */
@Injectable()
export class MarketingLogProducerService extends NestLogProducer {
  constructor(config: ConfigService, client: LogServerApiClientService) {
    const logger = new Logger(MarketingLogProducerService.name);
    super({
      environment: config.get<string>('APP_ENV') ?? 'dev',
      transport: (records: LogEnvelopeWire[]) =>
        client.post<{ accepted: number; rejected: number; errors: { reason: string; detail: string }[] }>(
          '/logs',
          { records },
        ),
      logger: {
        warn: (message) => logger.warn(message),
        error: (message) => logger.error(message),
      },
    });
  }
}
