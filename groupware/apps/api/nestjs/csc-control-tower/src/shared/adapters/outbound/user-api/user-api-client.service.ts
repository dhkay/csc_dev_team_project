import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestServiceClient } from '@csc/net-utils/nest';
import { UserApiTokenService } from './user-api-token.service';

/**
 * user 서버 HTTP 클라이언트(내부망 Docker network). 공유 `NestServiceClient` 를 상속해
 * baseUrl 과 서비스토큰만 주입한다. 계약: docs/specs/service-http-contract.md §3.
 */
@Injectable()
export class UserApiClientService extends NestServiceClient {
  constructor(config: ConfigService, tokenService: UserApiTokenService) {
    super({
      baseUrl: config.get<string>('USER_API_URL') ?? 'http://localhost:3002',
      serviceToken: () => tokenService.createServiceToken(),
    });
  }
}
