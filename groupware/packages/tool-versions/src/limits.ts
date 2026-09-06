/**
 * 영상 한 편의 동영상(세그먼트) 수 상한. 버전과 무관하게 하나다(갈리는 날 파이프라인 표로 옮긴다).
 *
 * 서버(기획 개수 clamp, 정제 결과 거절)와 화면(v1.0 개수 선택지, v1.5 시작 전 검사)이 같은 수를 봐야
 * 한다. 각자 적어 두던 동안은 "백엔드와 맞춘다" 는 주석이 유일한 끈이었다.
 *
 * 8 인 근거 둘. v1.0 은 자체 vLLM 창(8192)에 기획안 여러 벌이 들어야 하고, v1.5 는 숏츠 규격
 * (동영상 8개 × 최대 10초)이다.
 */
export const MAX_SEGMENTS_PER_VIDEO = 8;

/**
 * 상한 초과의 기계 판별 코드. 서버가 400 본문의 `code` 로 실어 보내고 web BFF 가 사용자 문장과
 * 취소로 잇는다. 400 을 일반 "잘못된 요청" 과 공유하므로 상태코드로는 갈리지 않는다.
 */
export const SEGMENT_LIMIT_EXCEEDED = 'SEGMENT_LIMIT_EXCEEDED';

/**
 * 상한 초과 안내. 화면의 시작 전 검사와 서버의 거절이 같은 문장을 쓴다. 미리 막힌 사람과 정제 뒤에
 * 막힌 사람이 다른 말을 들으면 두 번째 사람은 규칙이 둘인 줄 안다.
 */
export function segmentLimitMessage(count: number): string {
  return `동영상은 최대 ${MAX_SEGMENTS_PER_VIDEO}개까지 만들 수 있습니다. 지금 입력은 ${count}개로 나뉩니다. 내용을 합치거나 줄여 다시 시도하세요.`;
}
