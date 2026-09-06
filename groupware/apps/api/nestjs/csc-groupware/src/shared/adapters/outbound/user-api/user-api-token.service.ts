import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createServiceToken as signServiceToken,
  resolveServiceSecret,
} from '@csc/net-utils';

/**
 * user 서버 호출용 서비스 토큰 발급: `X-Service-Token`(HS256)
 * service 클레임은 'csc-groupware'(user 서버 ALLOWED_SERVICES 화이트리스트와 일치)
 * 시크릿은 전 서버 공통 SERVICE_TOKEN_SECRET. 발급 로직은 `@csc/net-utils` 위임
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
    return signServiceToken(this.secret, 'csc-groupware');
  }
}
