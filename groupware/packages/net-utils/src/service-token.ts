/**
 * 서버 간 인증(Layer 3): X-Service-Token 발급/검증 (HS256)
 * 계약: docs/specs/service-http-contract.md §1.
 *
 * 표준 HS256 JWT 라 jsonwebtoken / Python hmac 구현과 상호호환된다(서명 입력, base64url 동일)
 * 런타임 의존성 0: node:crypto 만 사용
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TTL_SECONDS = 3600;

function b64url(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64url');
}

export interface ServiceTokenPayload {
  service: string;
  iat: number;
  exp: number;
}

/** HS256 서비스 토큰 발급. jsonwebtoken.sign({service},secret,{HS256,1h}) 와 동일 산출 */
export function createServiceToken(
  secret: string,
  service: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({ service, iat: now, exp: now + ttlSeconds }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = b64url(createHmac('sha256', secret).update(signingInput).digest());
  return `${signingInput}.${signature}`;
}

/**
 * 서비스 토큰 검증. 유효하면 payload, 아니면 null.
 * - 서명 불일치 / 형식오류 / exp 만료 → null
 * - allowed 가 주어지면 `service` 가 화이트리스트에 있어야 함
 */
export function verifyServiceToken(
  token: string,
  secret: string,
  allowed?: Iterable<string>,
): ServiceTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  const signingInput = `${headerB64}.${payloadB64}`;
  const expected = createHmac('sha256', secret).update(signingInput).digest();

  let actual: Buffer;
  try {
    actual = Buffer.from(sigB64, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  let payload: ServiceTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  if (typeof payload.service !== 'string' || payload.service.length === 0) {
    return null;
  }
  if (allowed) {
    const set = allowed instanceof Set ? allowed : new Set(allowed);
    if (!set.has(payload.service)) return null;
  }
  return payload;
}

/**
 * SERVICE_TOKEN_SECRET 조회 (fail-closed)
 * prod 에서 미설정 시 throw, 비-prod 에서만 dev 폴백 허용
 */
export function resolveServiceSecret(
  value: string | undefined,
  opts: { isProduction: boolean; devFallback?: string } = { isProduction: true },
): string {
  if (value) return value;
  if (opts.isProduction) {
    throw new Error('SERVICE_TOKEN_SECRET 미설정: 서버 간 인증을 처리할 수 없습니다 (fail-closed).');
  }
  return opts.devFallback ?? 'dev-only-service-secret';
}
