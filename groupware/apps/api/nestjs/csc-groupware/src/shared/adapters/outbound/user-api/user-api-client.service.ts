import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestServiceClient } from '@csc/net-utils/nest';
import { UserApiTokenService } from './user-api-token.service';

/**
 * user 서버 HTTP 클라이언트: 내부망(Docker network) 호출
 * 공유 `NestServiceClient`(X-Service-Token 자동 주입, 타임아웃, HttpError→HttpException 변환)를 상속하고
 * baseUrl, 서비스토큰만 주입한다. get/post/patch/delete 는 베이스에서 상속
 * user 서버는 userdb(인증/계정/엔타이틀먼트) 소유: csc-groupware 는 위임 호출만 한다.
 * 계약: docs/specs/service-http-contract.md §3.
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
