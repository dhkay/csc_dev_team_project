import { describe, it, expect } from 'vitest';
import { createServiceToken, verifyServiceToken, resolveServiceSecret } from './service-token';

const SECRET = 'test-secret';

describe('service-token', () => {
  it('발급한 토큰을 같은 시크릿으로 검증하면 payload 를 돌려준다', () => {
    const token = createServiceToken(SECRET, 'csc-groupware');
    const payload = verifyServiceToken(token, SECRET);
    expect(payload?.service).toBe('csc-groupware');
    expect(payload?.exp).toBeGreaterThan(payload!.iat);
  });

  it('다른 시크릿이면 검증 실패(null)', () => {
    const token = createServiceToken(SECRET, 'csc-groupware');
    expect(verifyServiceToken(token, 'wrong-secret')).toBeNull();
  });

  it('allowed 화이트리스트에 없으면 null', () => {
    const token = createServiceToken(SECRET, 'stranger');
    expect(verifyServiceToken(token, SECRET, ['csc-groupware', 'user'])).toBeNull();
  });

  it('allowed 화이트리스트에 있으면 통과', () => {
    const token = createServiceToken(SECRET, 'user');
    expect(verifyServiceToken(token, SECRET, ['csc-groupware', 'user'])?.service).toBe('user');
  });

  it('만료된 토큰(ttl<0)은 null', () => {
    const token = createServiceToken(SECRET, 'user', -10);
    expect(verifyServiceToken(token, SECRET)).toBeNull();
  });

  it('형식 오류 토큰은 null', () => {
    expect(verifyServiceToken('not.a.jwt.token', SECRET)).toBeNull();
    expect(verifyServiceToken('only-one-part', SECRET)).toBeNull();
  });

  it('표준 HS256 JWT 구조(헤더 alg/typ)를 따른다', () => {
    const [headerB64] = createServiceToken(SECRET, 'user').split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
  });

  it('resolveServiceSecret: prod 미설정이면 throw, dev 폴백 허용', () => {
    expect(() => resolveServiceSecret(undefined, { isProduction: true })).toThrow();
    expect(resolveServiceSecret(undefined, { isProduction: false })).toBe('dev-only-service-secret');
    expect(resolveServiceSecret('real', { isProduction: true })).toBe('real');
  });
});
