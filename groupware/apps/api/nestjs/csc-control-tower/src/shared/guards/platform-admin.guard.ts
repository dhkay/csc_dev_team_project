import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';

/**
 * 플랫폼 관리자 인가 가드(멀티테넌시)
 *
 * user 서버와 동일한 JWT_SECRET 으로 access token 을 검증하고 PLATFORM 조직 + ROOT/ADMIN
 * 일 때만 통과시킨다. 전역 ServiceTokenGuard 가 "어느 서버인지" 를 본다면 이쪽은 "어떤 사람인지" 를 본다.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  private readonly logger = new Logger(PlatformAdminGuard.name);
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = this.resolveSecret(config);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('액세스 토큰이 필요합니다.');
    }

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(header.slice('Bearer '.length), this.secret, {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload;
    } catch {
      throw new UnauthorizedException('유효하지 않은 액세스 토큰입니다.');
    }

    const isPlatform = payload.organizationType === 'PLATFORM';
    const isAdmin = payload.role === 'ROOT' || payload.role === 'ADMIN';
    if (!isPlatform || !isAdmin) {
      throw new ForbiddenException('플랫폼 관리자만 접근할 수 있습니다.');
    }

    return true;
  }

  /** JWT_SECRET 해석 (fail-closed): user 서버 access token 서명 키와 동일해야 한다. */
  private resolveSecret(config: ConfigService): string {
    const secret = config.get<string>('JWT_SECRET');
    if (secret) return secret;

    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET 미설정: 액세스 토큰을 검증할 수 없습니다 (fail-closed).');
    }
    this.logger.warn('JWT_SECRET 미설정: 개발 전용 시크릿으로 폴백합니다.');
    return 'dev-user-access-secret-change-me';
  }
}
