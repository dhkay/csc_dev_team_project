import { isAxiosError } from 'axios';

export enum HttpErrorType {
  CLIENT = 'CLIENT',
  SERVER = 'SERVER',
  UNEXPECTED = 'UNEXPECTED',
}

/**
 * 서버 에러 응답 본문(우리 API 규약): 모든 필드 선택적
 * `error.response.data` 는 외부 경계라 타입이 미지정이므로, 읽는 모양을 한 번만 명명해
 * 파싱, 보존 양쪽에서 any/unknown 캐스팅 없이 타입 안전하게 다룬다.
 * `details` 만 진짜 임의 구조라 Record<string, unknown> 로 둔다.
 */
export interface ApiErrorBody {
  error?: string;
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
}

export class HttpError extends Error {
  type: HttpErrorType;
  statusCode: number;
  response?: {
    status: number;
    data?: ApiErrorBody;
  };

  constructor({
    type,
    message,
    statusCode,
    response,
  }: {
    type: HttpErrorType;
    message: string;
    statusCode: number;
    response?: {
      status: number;
      data?: ApiErrorBody;
    };
  }) {
    super(message);
    this.name = 'HttpError';
    this.type = type;
    this.statusCode = statusCode;
    this.response = response;
  }
}

export function getErrorTypeFromStatusCode(statusCode?: number) {
  if (!statusCode) return HttpErrorType.UNEXPECTED;
  if (statusCode < 500) return HttpErrorType.CLIENT;
  return HttpErrorType.SERVER;
}

export class ApiErrorHandler {
  static handle(error: unknown): HttpError {
    if (error instanceof HttpError) {
      return error;
    }

    if (isAxiosError(error)) {
      if (!error.response) {
        return new HttpError({
          type: HttpErrorType.SERVER,
          message: this.getNetworkErrorMessage(error),
          statusCode: 503,
        });
      }

      const statusCode = error.response.status;
      const data = error.response.data as ApiErrorBody | undefined;
      const message = data?.error || data?.message || '알 수 없는 오류가 발생했습니다';

      return new HttpError({
        type: getErrorTypeFromStatusCode(statusCode),
        message,
        statusCode,
        response: {
          status: statusCode,
          data: typeof data === 'object' ? data : undefined,
        },
      });
    }

    return new HttpError({
      type: HttpErrorType.UNEXPECTED,
      message: '예상치 못한 오류가 발생했습니다',
      statusCode: 500,
    });
  }

  private static getNetworkErrorMessage(error: { code?: string }): string {
    if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED') {
      return '서비스에 연결할 수 없습니다';
    }
    if (error.code === 'ECONNRESET') {
      return '서버 연결이 끊어졌습니다';
    }
    if (error.code === 'ETIMEDOUT') {
      return '서버 응답 시간이 초과되었습니다';
    }
    return '네트워크 연결에 실패했습니다';
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}
