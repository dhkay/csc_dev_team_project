/** BFF → 백엔드 서비스 토큰 생성 유틸 (Node.js crypto, jsonwebtoken 호환) */
import { createHmac } from 'node:crypto';
import { env } from '$env/dynamic/private';

/** Base64url 인코딩 */
function base64url(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64url');
}

/** 서비스 토큰 시크릿 조회 (fail-closed). 비-개발 환경 미설정 시 throw. */
function resolveServiceSecret(): string {
  const secret = env.SERVICE_TOKEN_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV !== 'development') {
    throw new Error(
      'SERVICE_TOKEN_SECRET 미설정: 서버 간 인증 토큰을 발급할 수 없습니다 (fail-closed).',
    );
  }
  console.warn('[ServiceToken] SERVICE_TOKEN_SECRET 미설정: 개발 전용 시크릿으로 폴백합니다.');
  return 'dev-only-service-secret';
}

/** HS256 JWT 생성: jsonwebtoken.verify()와 완전 호환 */
export function createServiceToken(): string {
  const secret = resolveServiceSecret();

  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({
      // 호출자 식별자: 백엔드 ALLOWED_SERVICES 와 글자 그대로 일치해야 한다.
      service: 'web-control-tower',
      iat: now,
      exp: now + 3600, // 1시간
    }),
  );

  const unsigned = `${header}.${payload}`;
  const signature = base64url(createHmac('sha256', secret).update(unsigned).digest());

  return `${unsigned}.${signature}`;
}
