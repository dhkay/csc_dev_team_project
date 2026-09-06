// 기획안 개수와 씬 개수의 범위 방어. 어느 버전이든 같은 범위로 거른다.
// 프롬프트 파일이 아니라 여기 있는 이유: 문구가 아니라 요청 정규화 규칙이기 때문
// 그 버전이 몇 개 만드는가는 파이프라인 사실이라 pinnedProposalCount 가 갖고 이 범위 뒤에 적용됨
// 화면도 같은 범위로 pill 을 그리므로 어긋나면 고른 값이 조용히 접힘
import {
  MAX_SEGMENTS_PER_VIDEO,
  SEGMENT_LIMIT_EXCEEDED,
  segmentLimitMessage,
} from '../../../../shared/domain/version-pipeline';

// 상한은 자체 vLLM 컨텍스트 창(8192)에 결과가 들도록 보수적으로 잡음
// export 인 이유: clamp 폴백이면서 프롬프트에 보이는 문장의 출처("기획안 1~6개")이기도 함
export const DEFAULT_PLAN_COUNT = 5;
export const MIN_PLAN_COUNT = 1;
export const MAX_PLAN_COUNT = 6;
export const DEFAULT_SCENE_COUNT = 6;
// 하한 1: 화면이 1~8 을 고르게 하므로 3 으로 두면 1, 2 를 골라도 조용히 3 씬이 나옴
export const MIN_SCENE_COUNT = 1;
// 상한은 커널(@csc/tool-versions)이 갖고 화면이 같은 수를 읽는다. 이 이름은 이 서버의 어휘라 유지
export const MAX_SCENE_COUNT = MAX_SEGMENTS_PER_VIDEO;

// 상한 초과의 거절 코드와 안내도 커널의 것이다. 화면의 시작 전 검사가 같은 문장을 쓴다.
export { SEGMENT_LIMIT_EXCEEDED, segmentLimitMessage };

/** 정수화 + 범위 clamp. 범위 밖이나 비정상 값은 기본값으로 방어 */
export function clampPlanCount(n: unknown): number {
  const v = Math.trunc(Number(n));
  return Number.isFinite(v) ? Math.min(MAX_PLAN_COUNT, Math.max(MIN_PLAN_COUNT, v)) : DEFAULT_PLAN_COUNT;
}

/** 씬 개수 정수화 + 범위 clamp */
export function clampSceneCount(n: unknown): number {
  const v = Math.trunc(Number(n));
  return Number.isFinite(v) ? Math.min(MAX_SCENE_COUNT, Math.max(MIN_SCENE_COUNT, v)) : DEFAULT_SCENE_COUNT;
}
