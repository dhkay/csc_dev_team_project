import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createServiceToken as signServiceToken,
  resolveServiceSecret,
} from '@csc/net-utils';

/**
 * user 서버 호출용 `X-Service-Token`(HS256) 발급.
 * service 클레임 'csc-control-tower' 는 user 서버 ALLOWED_SERVICES 와 글자 그대로 일치해야 한다.
 * 계약: docs/specs/service-http-contract.md §1.
 */
@Injectable()
export class UserApiTokenService {
  private readonly logger = new Logger(UserApiTokenService.name);
  private readonly secret: string;

  constructor(config: ConfigService) {
    const raw = config.get<string>('SERVICE_TOKEN_SECRET');
    if (!raw && process.env.NODE_ENV !== 'production') {
      this.logger.warn('SERVICE_TOKEN_SECRET 미설정: 개발 전용 시크릿으로 폴백합니다.');
    }
    this.secret = resolveServiceSecret(raw, {
      isProduction: process.env.NODE_ENV === 'production',
    });
  }

  createServiceToken(): string {
    return signServiceToken(this.secret, 'csc-control-tower');
  }
}
