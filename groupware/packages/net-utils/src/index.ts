// @csc/net-utils: 서버 간 HTTP 통신 공유 유틸 (TS 측 단일 구현)
// 계약 단일 진실원: docs/specs/service-http-contract.md
export {
  HttpError,
  HttpErrorType,
  type ApiErrorBody,
  getErrorTypeFromStatusCode,
  isHttpError,
  extractMessage,
  toApiErrorBody,
  httpErrorFromResponse,
  httpErrorFromNetwork,
} from './http-error';

export {
  createServiceToken,
  verifyServiceToken,
  resolveServiceSecret,
  type ServiceTokenPayload,
} from './service-token';

export {
  createHttpClient,
  type HttpClient,
  type HttpClientOptions,
} from './http-client';

// 상관관계(trace/request id). 소비자가 실제로 쓰는 것만 노출한다.
// id 생성, 정규화, 컨텍스트 주입은 미들웨어/진입점 헬퍼의 내부 구현이라 공개하면
// 계약만 넓어지고 우회 사용을 부른다. 필요하면 './request-context' 에서 직접 import.
export {
  TRACE_ID_HEADER,
  REQUEST_ID_HEADER,
  type RequestContext,
  // 읽기: 로그/에러 리포팅 호출부가 현재 trace 를 집어갈 때
  getRequestContext,
  getTraceId,
  getRequestId,
  // 진입점(BFF) 과 아웃바운드 전파: 배선에 필요한 두 개
  withCorrelationScope,
  applyCorrelationHeaders,
  type CorrelatableRequestConfig,
} from './request-context';
