/**
 * AI 모델 호출이 조직 설정이나 과금 때문에 막힌 실패의 식별: 재시도로 풀리지 않는 부류
 *
 * 같은 실패라도 조치가 정반대다. 일시적인 것(엔진 혼잡, 벤더 5xx, 분당 한도)은 다시 시도하면
 * 되지만, 설정과 과금(API 키 미등록, 결제 한도 초과)은 사람이 환경설정이나 벤더 대시보드를
 * 고쳐야 한다. 여기서 재시도 버튼을 권하면 사용자는 같은 실패를 반복해서 본다. 여러 건이 동시에
 * 도는 작업은 전부 같은 이유로 실패하므로 부분 산출물을 남기지 말고 작업을 취소하는 게 맞다.
 *
 * 판정 근거는 문구가 아니라 코드다. 서버 문구는 언제든 다듬어지고 벤더마다 다르다.
 * 이 모듈은 무의존 커널 말고는 import 하지 않는다(서버 BFF 와 브라우저가 함께 import 한다).
 */

// 모델 호출이 조직 설정/과금 때문에 막혔다. 재시도 불가, 사람이 고쳐야 한다.
export const MODEL_SETUP_REQUIRED = 'MODEL_SETUP_REQUIRED';

// 모델 호출이 벤더 분당 한도에 걸렸다(429). 위 코드와 반대로 사람이 고칠 것은 없고 잠시 뒤면 풀린다.
//   둘을 같은 문장("AI 모델 요청이 거부되었습니다")으로 덮으면 결제를 확인해야 하는 사람과 기다리면
//   되는 사람이 같은 안내를 받는다.
export const MODEL_RATE_LIMITED = 'MODEL_RATE_LIMITED';

/**
 * 같은 요청이 이미 처리 중이다(중복 제출). 잠시 후 다시 시도하면 풀린다.
 *
 * 위 코드와 정반대 성질이라 함께 둔다. 이건 사람이 고칠 것이 없고, 앞 요청이 끝나면 같은 요청이
 * 그 산출물을 그대로 받는다(멱등키가 같으므로 새로 만들지 않는다).
 *
 * 409 를 이름 중복과 공유하므로 상태코드로는 갈리지 않는다. 그래서 코드로 판별한다.
 */
export const SAGA_BUSY = 'SAGA_BUSY';

// 입력이 동영상 수 상한을 넘게 나뉘었다. 재시도해도 같은 실패라 사람이 입력을 합치거나 줄여야 한다.
//   코드는 서버와 같은 커널의 것이다. 400 을 일반 "잘못된 요청" 과 공유하므로 상태코드로는 갈리지 않고,
//   BFF 가 이 코드의 400 만 서버 문장과 코드를 그대로 통과시킨다.
export { SEGMENT_LIMIT_EXCEEDED } from '@csc/tool-versions';

/**
 * 사유 코드를 들고 다니는 API 실패: TanStack queryFn 은 `throw` 로만 실패를 표현하므로,
 * 봉투(`ApiResult.errorCode`)의 코드를 잃지 않으려면 에러 객체에 실어야 한다.
 */
export class MarketingApiError extends Error {
  constructor(
    message: string,
    readonly errorCode?: string,
  ) {
    super(message);
    this.name = 'MarketingApiError';
  }
}

/**
 * 설정/과금 때문에 막힌 실패인가: 실패 봉투(`{ errorCode }`)와 던져진 에러 양쪽을 받는다.
 * 소비처가 봉투를 볼 때도 있고(씬 이미지) 쿼리 에러를 볼 때도 있어(기획서 텍스트) 한 함수로 둔다.
 */
export function isModelSetupError(source: unknown): boolean {
  return errorCodeOf(source) === MODEL_SETUP_REQUIRED;
}

/**
 * 실패 알림 제목에 붙는 사유. 코드를 아는 실패만 사유를 말하고 나머지는 빈 문자열
 * 문장(detail)은 서버 것을 그대로 쓰되, 제목이 조치의 방향(결제 확인 / 기다리기)을 먼저 가른다.
 */
export function failureTitleSuffix(source: unknown): string {
  switch (errorCodeOf(source)) {
    case MODEL_SETUP_REQUIRED:
      return ': API 키 또는 결제 확인 필요';
    case MODEL_RATE_LIMITED:
      return ': 요청 한도 초과, 잠시 후 다시 시도';
    default:
      return '';
  }
}

function errorCodeOf(source: unknown): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const code = (source as { errorCode?: unknown }).errorCode;
  return typeof code === 'string' ? code : undefined;
}
