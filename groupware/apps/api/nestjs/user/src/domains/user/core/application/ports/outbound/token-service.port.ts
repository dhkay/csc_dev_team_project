import {
  AccessTokenPayload,
  RefreshTokenPayload,
} from '../../../domain/types/user.types';

/** 토큰 서비스 아웃바운드 포트 (JWT 발급/검증) */
export interface TokenServicePort {
  signAccessToken(payload: AccessTokenPayload): string;
  signRefreshToken(payload: RefreshTokenPayload): string;
  verifyAccessToken(token: string): AccessTokenPayload;
  verifyRefreshToken(token: string): RefreshTokenPayload;
}

export const TOKEN_SERVICE_PORT = Symbol('TOKEN_SERVICE_PORT');
