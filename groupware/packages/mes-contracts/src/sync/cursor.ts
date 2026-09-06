/**
 * 동기화 커서 인코딩
 *
 * 커서는 엔티티별 seq 맵을 담은 opaque 토큰이다. 단일 스칼라가 아닌 이유:
 * 클라이언트가 entities= 로 부분집합을 요청하면, 요청하지 않은 엔티티의 변경이 스칼라 커서를
 * 전진시켜 나중에 그 엔티티를 추가했을 때 과거 변경이 영구 누락된다. 맵이면 엔티티를 나중에
 * 추가해도 그 엔티티만 0 부터 시작한다.
 *
 * 프로토콜 전문: docs/specs/mes-sync-protocol.md
 */
import { WIRE_VERSION } from '../version';
import type { SyncEntity } from './entity';

/** 디코딩된 커서 */
export interface SyncCursor {
  // 계약 버전. WIRE_VERSION 과 다르면 재부트스트랩
  v: number;
  // 단말 스코프 버전. mes_devices.scope_version 과 다르면 재부트스트랩
  sv: number;
  // 엔티티별 마지막 수신 seq
  s: Partial<Record<SyncEntity, number>>;
}

/** 커서 해석 실패. 서버는 이걸 CURSOR_VERSION_MISMATCH 로 매핑한다. */
export class InvalidCursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCursorError';
  }
}

/**
 * base64url 을 직접 구현한다. `btoa`/`atob`(브라우저)도 `Buffer`(Node)도 쓰지 않는다.
 *
 * 이 패키지는 zero-dep 이고 소비자가 셋이다(CommonJS NestJS, ESM SvelteKit, 그리고 Rust
 * 미러가 같은 포맷을 구현한다). 런타임 전역에 기대면 그중 한 곳에서 조용히 깨지고,
 * 타입 정의를 위해 lib 에 DOM 을 끌어오면 서버 패키지가 브라우저 타입을 갖게 된다.
 * 40줄 남짓이라 직접 쓰는 편이 싸다.
 */
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** 문자열을 UTF-8 바이트로. 서로게이트 쌍(이모지 등)까지 처리한다. */
function toUtf8Bytes(input: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    let code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const low = input.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
        i += 1;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

/** UTF-8 바이트를 문자열로 */
function fromUtf8Bytes(bytes: number[]): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    let code: number;
    if (b0 < 0x80) {
      code = b0;
      i += 1;
    } else if (b0 < 0xe0) {
      code = ((b0 & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      i += 2;
    } else if (b0 < 0xf0) {
      code = ((b0 & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      i += 3;
    } else {
      code =
        ((b0 & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      i += 4;
    }
    if (code > 0xffff) {
      const rest = code - 0x10000;
      out += String.fromCharCode(0xd800 + (rest >> 10), 0xdc00 + (rest & 0x3ff));
    } else {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

/** 패딩(`=`)은 붙이지 않는다. URL 과 헤더에 그대로 실리는 값이라 짧을수록 좋다. */
function toBase64Url(raw: string): string {
  const bytes = toUtf8Bytes(raw);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const remaining = bytes.length - i;
    const b0 = bytes[i];
    const b1 = remaining > 1 ? bytes[i + 1] : 0;
    const b2 = remaining > 2 ? bytes[i + 2] : 0;
    out += B64URL[b0 >> 2];
    out += B64URL[((b0 & 0x03) << 4) | (b1 >> 4)];
    if (remaining > 1) out += B64URL[((b1 & 0x0f) << 2) | (b2 >> 6)];
    if (remaining > 2) out += B64URL[b2 & 0x3f];
  }
  return out;
}

function fromBase64Url(token: string): string {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of token) {
    // 패딩은 무시한다. 남이 만든 토큰이 패딩을 붙여 왔을 수도 있다.
    if (ch === '=') continue;
    const value = B64URL.indexOf(ch);
    if (value < 0) throw new InvalidCursorError('커서에 허용되지 않는 문자가 있습니다.');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return fromUtf8Bytes(bytes);
}

/** 커서를 opaque 토큰으로 인코딩한다. */
export function encodeCursor(cursor: SyncCursor): string {
  return toBase64Url(JSON.stringify(cursor));
}

/**
 * opaque 토큰을 커서로 디코딩한다. 형식이 깨졌거나 계약 버전이 다르면 InvalidCursorError.
 *
 * scopeVersion 을 넘기면 단말 스코프 변경까지 함께 검증한다. 이 검증이 없으면 라인 재배정을
 * 받은 단말이 새 라인의 과거 데이터를 영원히 못 받는다(커서가 이미 그 지점을 지나쳐 있다)
 */
export function decodeCursor(token: string, scopeVersion?: number): SyncCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(token));
  } catch {
    throw new InvalidCursorError('커서를 해석할 수 없습니다.');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new InvalidCursorError('커서 형식이 올바르지 않습니다.');
  }
  const cursor = parsed as SyncCursor;
  if (cursor.v !== WIRE_VERSION) {
    throw new InvalidCursorError(`계약 버전 불일치: ${String(cursor.v)} != ${WIRE_VERSION}`);
  }
  if (scopeVersion !== undefined && cursor.sv !== scopeVersion) {
    throw new InvalidCursorError(`단말 스코프 버전 불일치: ${String(cursor.sv)} != ${scopeVersion}`);
  }
  if (typeof cursor.s !== 'object' || cursor.s === null) {
    throw new InvalidCursorError('커서에 seq 맵이 없습니다.');
  }
  return cursor;
}
