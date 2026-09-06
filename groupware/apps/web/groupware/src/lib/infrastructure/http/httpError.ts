import { isAxiosError, isCancel } from 'axios';

export enum HttpErrorType {
  CLIENT = 'CLIENT',
  SERVER = 'SERVER',
  UNEXPECTED = 'UNEXPECTED',
  // 부른 쪽이 끊은 요청(AbortSignal). 실패가 아니라 의도한 종료라 다른 셋과 갈라 둔다.
  //   갈라 두지 않으면 응답 없는 axios 에러로 읽혀 "네트워크 연결에 실패했습니다" 가 된다.
  CANCELED = 'CANCELED'
}

// 취소에 응답이 없어 상태 코드가 없다. 0 은 HTTP 코드가 아니라 "응답 없음" 을 뜻한다.
const NO_RESPONSE_STATUS = 0;

/**
 * 서버 에러 응답 본문(우리 API 규약): 모든 필드 선택적
 * `error.response.data` 는 외부 경계라 타입이 미지정이므로, 읽는 모양을 한 번만 명명해
 * 파싱, 보존 양쪽에서 any/unknown 캐스팅 없이 타입 안전하게 다룬다.
 * `details` 는 백엔드 도메인 예외의 부가 정보(예: 쿨다운 remainingSeconds)라 임의 구조로 둔다.
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
  // BFF 라우트 호환용 - 원본 응답 정보 보존
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
    // 이미 HttpError로 변환된 경우 그대로 반환
    if (error instanceof HttpError) {
      return error;
    }

    // 취소는 네트워크 에러 검사보다 먼저다. 취소된 요청도 응답이 없어 그 분기에 걸린다.
    if (isCancel(error)) {
      return new HttpError({
        type: HttpErrorType.CANCELED,
        message: '요청이 취소되었습니다.',
        statusCode: NO_RESPONSE_STATUS
      });
    }

    if (isAxiosError(error)) {
      // 네트워크 에러 (서버에 연결 실패)
      if (!error.response) {
        const message = this.getNetworkErrorMessage(error);
        return new HttpError({
          type: HttpErrorType.SERVER,
          message,
          statusCode: 503 // Service Unavailable
        });
      }

      // 서버 응답이 있는 경우
      const statusCode = error.response.status;
      const data = error.response.data as ApiErrorBody | undefined;
      const message = data?.error || data?.message || '알 수 없는 오류가 발생했습니다';

      return new HttpError({
        type: getErrorTypeFromStatusCode(statusCode),
        message,
        statusCode,
        response: {
          status: statusCode,
          data: typeof data === 'object' ? data : undefined
        }
      });
    }

    return new HttpError({
      type: HttpErrorType.UNEXPECTED,
      message: '예상치 못한 오류가 발생했습니다',
      statusCode: 500
    });
  }

  /**
   * 네트워크 에러 메시지 생성
   */
  private static getNetworkErrorMessage(error: any): string {
    // ERR_CONNECTION_REFUSED: 서버가 중지되었거나 연결 거부
    if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED') {
      return '서비스에 연결할 수 없습니다';
    }

    // ERR_CONNECTION_RESET: 연결이 끊어짐
    if (error.code === 'ECONNRESET') {
      return '서버 연결이 끊어졌습니다';
    }

    // ETIMEDOUT: 타임아웃
    if (error.code === 'ETIMEDOUT') {
      return '서버 응답 시간이 초과되었습니다';
    }

    // 기타 네트워크 에러
    return '네트워크 연결에 실패했습니다';
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

/** 부른 쪽이 끊은 요청인가. 취소를 실패로 알리거나 기록하지 않으려는 자리가 쓴다. */
export function isCanceledError(error: unknown): boolean {
  return isHttpError(error) ? error.type === HttpErrorType.CANCELED : isCancel(error);
}