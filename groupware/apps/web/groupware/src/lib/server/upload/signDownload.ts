// file-upload 서명 다운로드 토큰 생성 (SSR 전용, Node crypto + private env)
//
// file-upload 가 require_signed_download=true 일 때 GET /files/{uuid} 는 ?token= 을 요구한다.
// 이 토큰은 file-upload 의 signing.sign_download 와 바이트 동일 포맷이어야 검증된다:
//   token = "{uid}.{exp}.{base64url(HMAC_SHA256(secret, 'get:{uid}:{exp}'))}"  (exp = unix seconds)
// 시크릿은 UPLOAD_URL_SECRET (= file-upload upload_url_secret. prod/staging 은 SERVICE_TOKEN_SECRET 과 동일값)
//
// append-only 설계: signFileUrl 은 /files/{uuid} URL 에 ?token= 만 덧붙인다. file-upload 플래그가 OFF 면
// 토큰은 무시되어 무해하고, ON 이면 이 토큰으로 접근이 인가된다.
// 주의: 브라우저 번들 유입 금지($lib/server 하위 + node:crypto). 렌더 시 서버에서만 호출
import { createHmac } from 'node:crypto';
import { env } from '$env/dynamic/private';

/**
 * 서명 시크릿(fail-closed): file-upload 의 upload_url_secret 과 반드시 같은 값이어야 검증된다.
 *   prod/staging: compose 가 UPLOAD_URL_SECRET=SERVICE_TOKEN_SECRET 로 주입(file-upload 와 동일)
 *   dev: 미설정 시 file-upload dev 기본('dev-only-upload-secret')과 동일 폴백 → dev 정렬 유지
 * 주의: SERVICE_TOKEN_SECRET 로 폴백하지 않는다(dev 에서 그 값이 upload 시크릿과 달라 검증이 깨진다)
 */
function resolveUploadSecret(): string {
  const secret = env.UPLOAD_URL_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('UPLOAD_URL_SECRET 미설정: 서명 다운로드 토큰을 발급할 수 없습니다 (fail-closed).');
  }
  return 'dev-only-upload-secret';
}

/** file-upload 와 동일 포맷의 서명 다운로드 토큰 */
export function signDownloadToken(uid: string, ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac('sha256', resolveUploadSecret())
    .update(`get:${uid}:${exp}`)
    .digest()
    .toString('base64url');
  return `${uid}.${exp}.${sig}`;
}

/**
 * /files/{uuid} 접근 URL 에 서명 토큰을 덧붙인다(append-only). /files/ URL 이 아니면 원본을 그대로 반환(무해)
 * 저장된 맨 URL(조직 로고/아바타 등)이나 재구성한 URL(마케팅 에셋)을 렌더 직전에 감싸는 용도
 */
export function signFileUrl(url: string | null | undefined, ttlSeconds = 3600): string | null {
  if (!url) return url ?? null;
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/files\/([^/]+)$/);
    if (!m) return url; // /files/{uuid} 형태가 아니면 손대지 않는다
    u.searchParams.set('token', signDownloadToken(decodeURIComponent(m[1]), ttlSeconds));
    return u.toString();
  } catch {
    return url; // 파싱 불가(상대경로 등)면 원본 유지: append-only 라 무해
  }
}
