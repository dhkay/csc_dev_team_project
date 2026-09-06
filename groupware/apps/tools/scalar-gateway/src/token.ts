/**
 * 서비스토큰 발급: scalar-gateway 신원으로 각 백엔드를 호출한다(BFF 와 동일 방식).
 * 발급 로직은 공유 코어(`@csc/net-utils`)를 재사용한다.
 *
 * 호출 주체명 'scalar-gateway' 는 각 백엔드의 ALLOWED_SERVICES 에 등록되어 있어야 통과한다.
 */
import { createServiceToken, resolveServiceSecret } from '@csc/net-utils';

const SERVICE_NAME = 'scalar-gateway';

// prod 에서 SERVICE_TOKEN_SECRET 미설정이면 fail-closed (resolveServiceSecret)
const secret = resolveServiceSecret(process.env.SERVICE_TOKEN_SECRET, {
  isProduction: process.env.NODE_ENV === 'production',
});

/** 짧은 TTL(기본 1h) 서비스토큰을 매 요청마다 새로 발급(만료 안전) */
export function mintServiceToken(): string {
  return createServiceToken(secret, SERVICE_NAME);
}
