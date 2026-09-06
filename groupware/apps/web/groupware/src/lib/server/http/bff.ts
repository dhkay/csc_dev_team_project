// BFF 공용 헬퍼 (서버 전용, $lib/server 하위 → 클라 번들 유입 불가)
// 모든 +server.ts 가 공유하는 봉투 빌더 + 인증 가드 + 백엔드 에러 매핑을 한 곳에 둔다.
// 도메인별 $lib/server/<domain>/bff.ts 의 requireX(인가), mapXError 는 이 코어에 위임한다.
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { isHttpError, type HttpError } from '$lib/infrastructure/http';

/** 성공 봉투. data 생략 시 { success:true } 만(빈 성공). null 은 명시적 값으로 실린다. */
export function ok<T>(data?: T, status = 200): Response {
  const body = data === undefined ? { success: true } : { success: true, data };
  return json(body, { status });
}

/** 실패 봉투. errorCode 선택. 기본 500. */
export function fail(
  error: string,
  opts: { status?: number; errorCode?: string } = {}
): Response {
  return json(
    {
      success: false,
      ...(opts.errorCode ? { errorCode: opts.errorCode } : {}),
      error
    },
    { status: opts.status ?? 500 }
  );
}

/** 라우트 파라미터를 양의 정수 id로 파싱: 유효하지 않으면 null(호출부에서 400 처리) */
export function parseIdParam(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * 인증(accessToken) 가드. 미인증이면 401 에러 Response, 통과면 null.
 * 단순 라우트: `const authErr = requireAuth(event); if (authErr) return authErr;`
 * 도메인 가드 합성: `const authErr = requireAuth(event); if (authErr) return { error: authErr };`
 */
export function requireAuth(event: RequestEvent): Response | null {
  return event.locals.accessToken ? null : fail('인증이 필요합니다.', { status: 401 });
}

/** 상태코드별 매핑 규칙(정적 또는 HttpError 로 계산: 예: 409 를 오류코드별로 분기). status 생략 시 원 상태 보존 */
type ErrorRuleValue = { message: string; status?: number; errorCode?: string };
export type HttpErrorRule = ErrorRuleValue | ((error: HttpError) => ErrorRuleValue);

/**
 * 401/403 → '권한이 없습니다.'(상태 보존) 공통 규칙. 그 매핑을 쓰는 라우트는 table 에 스프레드한다:
 * `table: { ...AUTH_ERROR_RULES, 404: { message: '...' } }`.
 * (기존 라우트별 if(401||403) 분기를 명시적으로 재현: 암묵 기본값을 두지 않아 fall-through 동작이 안 바뀐다.)
 */
export const AUTH_ERROR_RULES: Record<number, HttpErrorRule> = {
  401: { message: '권한이 없습니다.' },
  403: { message: '권한이 없습니다.' }
};

/**
 * 백엔드 호출 에러 → 사용자 응답 봉투. 암묵 기본 매핑 없음(무동작변경 보장):
 *  - table[status] 가 있으면 그 규칙으로 매핑(errorCode/커스텀 메시지/상태)
 *  - 없으면 fallback(500). 비-HttpError 도 fallback(500)
 * table 로 처리된 상태는 로그를 남기지 않고(기존과 동일), 미처리 상태, 비HTTP 만 log 라벨로 남긴다.
 */
export function mapHttpError(
  error: unknown,
  opts: { fallback: string; table?: Record<number, HttpErrorRule>; log?: string }
): Response {
  const { fallback, table, log } = opts;
  if (isHttpError(error)) {
    const rule = table?.[error.statusCode];
    if (rule) {
      const r = typeof rule === 'function' ? rule(error) : rule;
      return fail(r.message, { status: r.status ?? error.statusCode, errorCode: r.errorCode });
    }
    if (log) console.error(`${log} (status):`, error.statusCode);
  } else if (log) {
    console.error(`${log}:`, error instanceof Error ? error.message : 'unknown');
  }
  return fail(fallback, { status: 500 });
}
