import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import {
  AccessTokenPayload,
  PrincipalType,
  RefreshTokenPayload,
} from '../../../core/domain/types/user.types';
import {
  toAiToolKeys,
  toFeatureKeys,
  toPermissionKeys,
} from '../../../core/domain/types/entitlement-catalog';
import { TokenServicePort } from '../../../core/application/ports/outbound/token-service.port';

/**
 * JWT 토큰 서비스: jsonwebtoken(HS256)
 * Access 60일 / Refresh 10일 (쿠키 maxAge 는 더 짧아 proactive refresh 유도; auth-process-flow.md)
 */
@Injectable()
export class JwtTokenService implements TokenServicePort {
  private readonly logger = new Logger(JwtTokenService.name);
  private readonly accessSecret: string;
  private readonly refreshSecret: string;

  constructor(config: ConfigService) {
    this.accessSecret = this.resolveSecret(config, 'JWT_SECRET', 'dev-only-access-secret');
    this.refreshSecret = this.resolveSecret(
      config,
      'JWT_REFRESH_SECRET',
      'dev-only-refresh-secret',
    );
  }

  signAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, this.accessSecret, { algorithm: 'HS256', expiresIn: '60d' });
  }

  signRefreshToken(payload: RefreshTokenPayload): string {
    return jwt.sign(payload, this.refreshSecret, { algorithm: 'HS256', expiresIn: '10d' });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const decoded = jwt.verify(token, this.accessSecret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    return {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      userType: decoded.userType,
      role: decoded.role,
      principalType: this.normalizePrincipalType(decoded.principalType),
      organizationId: decoded.organizationId,
      organizationType: decoded.organizationType,
      // 닫힌 집합으로 좁힌다. 코드에서 제거된 key 가 구 토큰에 남아도 다운스트림에 새지 않게
      features: decoded.features ? toFeatureKeys(decoded.features) : undefined,
      aiTools: decoded.aiTools ? toAiToolKeys(decoded.aiTools) : undefined,
      permissions: decoded.permissions ? toPermissionKeys(decoded.permissions) : undefined,
    };
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    const decoded = jwt.verify(token, this.refreshSecret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    // tokenVersion 클레임이 없던 기존 토큰은 0 으로 간주(하위호환: 배포 시 강제 재로그인 방지)
    return {
      id: decoded.id,
      tokenVersion: decoded.tokenVersion ?? 0,
      principalType: this.normalizePrincipalType(decoded.principalType),
    };
  }

  /**
   * principalType 정규화(레거시 호환): 클레임 리네임 전 토큰을 새 값으로 매핑한다.
   * 구 'PLATFORM_ADMIN'→ADMIN_USER, 'TENANT_USER'/'SERVICE_USER'→ORGANIZATION_USER.
   * 클레임이 없던 토큰도 조직유저로 간주(default)
   */
  private normalizePrincipalType(raw: unknown): PrincipalType {
    switch (raw) {
      case PrincipalType.ADMIN_USER:
      case 'PLATFORM_ADMIN':
        return PrincipalType.ADMIN_USER;
      case PrincipalType.ORGANIZATION_USER:
      case 'TENANT_USER':
      case 'SERVICE_USER':
      default:
        return PrincipalType.ORGANIZATION_USER;
    }
  }

  /**
   * 토큰 서명 키 해석 (fail-closed)
   * prod 에서 미설정 시 하드코딩 폴백으로 토큰 위조가 가능해지므로 즉시 throw 한다.
   * 개발(NODE_ENV!=production)에서만 명시적 dev 시크릿으로 폴백한다.
   * (ServiceTokenGuard.resolveSecret / BFF serviceToken.ts 와 동일한 정책)
   */
  private resolveSecret(config: ConfigService, key: string, devFallback: string): string {
    const secret = config.get<string>(key);
    if (secret) return secret;

    if (process.env.NODE_ENV === 'production') {
      throw new Error(`${key} 미설정: 토큰 서명 키가 없습니다 (fail-closed).`);
    }
    this.logger.warn(`${key} 미설정: 개발 전용 시크릿으로 폴백합니다.`);
    return devFallback;
  }
}
