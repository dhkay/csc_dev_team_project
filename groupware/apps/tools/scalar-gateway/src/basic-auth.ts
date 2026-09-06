/**
 * 포털 BasicAuth: nginx IP allowlist 와 이중 방어(security-architecture.md 의 Swagger 보호 규칙)
 * SWAGGER_USER/SWAGGER_PASSWORD 미설정 시(dev) 비활성(경고)하고 통과한다. prod 는 compose 에서 주입
 */
import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  // 길이가 다르면 timingSafeEqual 이 throw: 길이 비교를 먼저(길이는 비밀이 아님)
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function basicAuth(): RequestHandler {
  const user = process.env.SWAGGER_USER;
  const pass = process.env.SWAGGER_PASSWORD;

  if (!user || !pass) {
    if (process.env.NODE_ENV === 'production') {
      // prod 는 nginx 가 1차 차단하지만, 앱 레벨 이중 방어가 비활성인 상태를 명확히 경고
      console.warn('[scalar-gateway] SWAGGER_USER/PASSWORD 미설정: BasicAuth 비활성(앱 레벨). nginx allowlist 에만 의존.');
    }
    return (_req, _res, next) => next();
  }

  const expected = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  return (req, res, next) => {
    const header = req.headers.authorization ?? '';
    if (safeEqual(header, expected)) {
      return next();
    }
    res
      .set('WWW-Authenticate', 'Basic realm="api-docs", charset="UTF-8"')
      .status(401)
      .send('Authentication required');
  };
}
