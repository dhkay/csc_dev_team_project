/**
 * 서버 간/외부 HTTP 호출의 정규화 에러 모델
 * 프론트 `lib/infrastructure/http/httpError.ts` 와 동일한 모양을 공유하되, axios 비종속(fetch 기반)이다.
 * 계약: docs/specs/service-http-contract.md §2 (에러 봉투)
 */

export enum HttpErrorType {
  CLIENT = 'CLIENT',
  SERVER = 'SERVER',
  UNEXPECTED = 'UNEXPECTED',
}

/**
 * 서버 에러 응답 본문(우리 API 규약): 모든 필드 선택적
 * `details` 는 도메인 예외 부가정보(예: 쿨다운 remainingSeconds)라 임의 구조
 */
export interface ApiErrorBody {
  error?: string;
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
}

export class HttpError extends Error {
  readonly type: HttpErrorType;
  readonly statusCode: number;
  // 원본 응답 정보 보존(상태/봉투): 호출처가 code, details 를 읽을 수 있게
  readonly response?: { status: number; data?: ApiErrorBody };

  constructor(params: {
    type: HttpErrorType;
    message: string;
    statusCode: number;
    response?: { status: number; data?: ApiErrorBody };
  }) {
    super(params.message);
    this.name = 'HttpError';
    this.type = params.type;
    this.statusCode = params.statusCode;
    this.response = params.response;
  }
}

export function getErrorTypeFromStatusCode(statusCode?: number): HttpErrorType {
  if (!statusCode) return HttpErrorType.UNEXPECTED;
  if (statusCode < 500) return HttpErrorType.CLIENT;
  return HttpErrorType.SERVER;
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

/**
 * 에러 봉투(ApiErrorBody)에서 사람이 읽는 메시지를 추출
 * FastAPI 기본 `{ detail }` 도 호환되도록 error → message → detail 순으로 읽는다.
 */
export function extractMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const candidate = d.error ?? d.message ?? d.detail;
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return fallback;
}

/** 응답 본문(파싱된 JSON 또는 undefined)을 ApiErrorBody 로 좁힌다. */
export function toApiErrorBody(data: unknown): ApiErrorBody | undefined {
  return data && typeof data === 'object' ? (data as ApiErrorBody) : undefined;
}

/** HTTP 상태 응답을 정규화 HttpError 로 변환 */
export function httpErrorFromResponse(statusCode: number, data: unknown): HttpError {
  const body = toApiErrorBody(data);
  return new HttpError({
    type: getErrorTypeFromStatusCode(statusCode),
    message: extractMessage(data, '알 수 없는 오류가 발생했습니다'),
    statusCode,
    response: { status: statusCode, data: body },
  });
}

/** 네트워크/타임아웃 등 응답 없는 실패를 503 HttpError 로 변환 */
export function httpErrorFromNetwork(message = '서비스에 연결할 수 없습니다'): HttpError {
  return new HttpError({ type: HttpErrorType.SERVER, message, statusCode: 503 });
}
