import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestServiceClient } from '@csc/net-utils/nest';
import { MarketingServiceTokenService } from '../service-token';

/**
 * data-collector 서비스 공유 HTTP 클라이언트(DI 싱글톤): X-Service-Token 자동 주입 + 재시도/타임아웃
 * 도메인 어댑터는 이 클라이언트를 주입만 받아 호출한다(직접 fetch/axios 금지)
 *
 * 폴백 6014 = dev compose 가 퍼블리시하는 호스트 포트. 이 서버는 도커 전용이라 다른 폴백이 없다.
 */
@Injectable()
export class DataCollectorApiClientService extends NestServiceClient {
  constructor(config: ConfigService, tokenService: MarketingServiceTokenService) {
    super({
      baseUrl: config.get<string>('DATA_COLLECTOR_API_URL') ?? 'http://localhost:6014',
      serviceToken: () => tokenService.createServiceToken(),
    });
  }
}
