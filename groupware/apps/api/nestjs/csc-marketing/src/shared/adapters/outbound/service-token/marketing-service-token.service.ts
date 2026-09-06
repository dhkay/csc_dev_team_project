import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServiceToken, resolveServiceSecret } from '@csc/net-utils';

/**
 * 서버 간 호출용 서비스 토큰 발급: 이 앱(csc-marketing)의 신원 하나
 * service 클레임은 호출 주체를 가리켜 대상 서버와 무관하므로 모든 클라이언트가 이 하나를 공유
 * prod 에서 SERVICE_TOKEN_SECRET 미설정이면 fail-closed. 신원 문자열 SSOT 는 security-architecture.md
 */
@Injectable()
export class MarketingServiceTokenService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = resolveServiceSecret(config.get('SERVICE_TOKEN_SECRET'), {
      isProduction: process.env.NODE_ENV === 'production',
    });
  }

  createServiceToken(): string {
    return createServiceToken(this.secret, 'csc-marketing');
  }
}
