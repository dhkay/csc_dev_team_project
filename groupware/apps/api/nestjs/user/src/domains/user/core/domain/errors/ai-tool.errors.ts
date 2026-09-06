/**
 * AI 도구 카탈로그 도메인 에러: Service 는 HTTP 를 모른다.
 * inbound 어댑터(필터)에서 HTTP 상태로 변환한다.
 */
export abstract class AiToolError extends Error {}

/** AI 도구 없음 (key 미존재) */
export class AiToolNotFoundError extends AiToolError {
  constructor(key: string) {
    super(`AI 도구를 찾을 수 없습니다: ${key}`);
  }
}

/** slug 중복: 이미 같은 slug 의 AI 도구가 존재 */
export class AiToolSlugAlreadyExistsError extends AiToolError {
  constructor(slug: string) {
    super(`이미 존재하는 AI 도구 slug 입니다: ${slug}`);
  }
}

/** slug 형식/예약어 위반 (예: 'admin' 등 라우팅 예약 세그먼트) */
export class InvalidAiToolSlugError extends AiToolError {
  constructor(reason: string) {
    super(reason);
  }
}
