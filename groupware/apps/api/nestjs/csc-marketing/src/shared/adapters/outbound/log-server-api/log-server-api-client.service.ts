import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestServiceClient } from '@csc/net-utils/nest';
import { MarketingServiceTokenService } from '../service-token';

/**
 * log-server 공유 HTTP 클라이언트(DI 싱글톤). X-Service-Token 자동 주입
 * retries: 0 인 이유는 재시도를 프로듀서가 소유하기 때문(여기서 재시도하면 flush 가 붙잡혀 마지막 버퍼 유실)
 * timeoutMs: 5000 인 이유는 로그 서버가 매달려도 배포 드레인을 지연시키지 않기 위함
 */
@Injectable()
export class LogServerApiClientService extends NestServiceClient {
  constructor(config: ConfigService, tokenService: MarketingServiceTokenService) {
    super({
      // 로컬 기본은 dev compose 호스트 포트(6015). dev compose 가 kafka 를 호스트로 노출하지 않아
      // log-server 를 호스트에서 직접 띄우면 로그를 발행할 수 없다. 배포는 LOG_SERVER_URL 로 오버라이드
      baseUrl: config.get<string>('LOG_SERVER_URL') ?? 'http://localhost:6015',
      serviceToken: () => tokenService.createServiceToken(),
      retries: 0,
      timeoutMs: 5_000,
    });
  }
}
