import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestServiceClient } from '@csc/net-utils/nest';
import { MarketingServiceTokenService } from '../service-token';

/**
 * file-upload 서비스 공유 HTTP 클라이언트(DI 싱글톤): X-Service-Token 자동 주입 + 재시도/타임아웃
 * 도메인 어댑터는 이 클라이언트를 주입만 받아 호출한다(직접 fetch/axios 금지)
 */
@Injectable()
export class FileUploadApiClientService extends NestServiceClient {
  constructor(config: ConfigService, tokenService: MarketingServiceTokenService) {
    super({
      baseUrl: config.get<string>('FILE_UPLOAD_API_URL') ?? 'http://localhost:8001',
      serviceToken: () => tokenService.createServiceToken(),
    });
  }
}
