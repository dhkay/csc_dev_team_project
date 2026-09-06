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
 * 플랫폼 ROOT 전용 인가 가드: PlatformAdminGuard + role==='ROOT'
 * 관리자 관리(플랫폼 관리자 추가/삭제/옵션)는 ROOT 만 가능하다.
 */
@Injectable()
export class PlatformRootGuard implements CanActivate {
  private readonly logger = new Logger(PlatformRootGuard.name);
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
    const isRoot = payload.role === 'ROOT';
    if (!isPlatform || !isRoot) {
      throw new ForbiddenException('플랫폼 루트관리자만 접근할 수 있습니다.');
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
