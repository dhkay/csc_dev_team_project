/**
 * 원천 영상 화질표(SSOT): 어떤 영상모델이 어떤 화질을 낼 수 있는가
 *
 * 소비자 둘이 같은 표를 쓰게 하는 것이 존재 이유다.
 *  - web-groupware(프론트): 영상 만들기 화면의 화질 선택지를 그린다.
 *  - csc-marketing(백엔드): 요청을 실제 지원 값으로 clamp 한다(클라이언트를 신뢰하지 않는다)
 *
 * 두 곳이 표를 따로 들면 반드시 어긋나고, 어긋난 결과가 조용하다. 프론트가 보여준 화질을
 * 서버가 기본값으로 clamp 해 버려서 사용자가 고른 값이 아무 경고 없이 무시된다.
 *
 * 픽셀 해석은 여기 없다. 화질 × 화면비 → WxH 는 렌더러(video-model `ffmpeg_ops._DIMS`)가 한다.
 * 언어가 달라 표를 공유할 수 없으므로 문자열만 맞춘다(아래 RESOLUTION_KEYS 와 그쪽 `_DIMS` 키)
 */

/** 지원 화질 등급. video-model `_DIMS` 의 키와 글자 그대로 일치해야 한다. */
export type VideoResolution = '480p' | '720p';

/** 유효한 화질 값 전체. DTO 검증 목록으로 그대로 쓴다(값을 다시 나열하지 않는다) */
export const RESOLUTION_KEYS = ['480p', '720p'] as const satisfies readonly VideoResolution[];

/** 기본 화질: 미지정/미지원 모델/구 레코드가 모두 이 값이다. */
export const DEFAULT_VIDEO_RESOLUTION: VideoResolution = '720p';

/**
 * 영상모델 → 고를 수 있는 화질
 *
 * 여기 없는 모델(자체 Wan, slideshow 폴백 등)은 화질 조정을 지원하지 않아 항상 기본값이다.
 *  - 자체 Wan 2.2 TI2V-5B: 공유 GPU VRAM(16GB)과 latent 제약으로 720p 검증분만 사용한다.
 *  - Grok Imagine: xAI API 가 해상도를 파라미터로 받는다.
 *
 * 주의: 화질을 낮춰도 xAI 요금은 줄지 않는다. 공식 가격표가 해상도 구분 없이 정액이라
 * 비용은 출력 길이(초)에만 비례한다(단가는 `@csc/pricing`). 낮은 화질의 이득은 생성 시간과
 * 결과물 용량이지 비용이 아니다.
 */
const RESOLUTIONS_BY_VIDEO_MODEL: Record<string, readonly VideoResolution[]> = {
  'grok-imagine-video': ['480p', '720p'],
};

/**
 * 이 영상모델로 고를 수 있는 화질 목록. 화면의 선택지가 이 값으로 그려진다.
 * 빈 배열이면 조정을 지원하지 않는 모델이라 항상 기본값으로 렌더된다.
 */
export function videoResolutionsFor(videoModel: string): readonly VideoResolution[] {
  return RESOLUTIONS_BY_VIDEO_MODEL[videoModel] ?? [];
}

/**
 * 이 모델에서 사용자가 화질을 고를 수 있는가(선택지가 둘 이상)
 * 하나뿐이면 고를 것이 없으므로 화면은 선택 UI 대신 고정 화질을 안내한다.
 */
export function supportsResolutionChoice(videoModel: string): boolean {
  return videoResolutionsFor(videoModel).length > 1;
}

/**
 * 요청 화질 → 실제 적용할 화질. 모델이 지원하지 않는 값(또는 미지정)이면 기본값으로 떨어진다.
 * 클라이언트가 무엇을 보내든 여기서 걸러지므로, 호출부는 결과를 그대로 저장/전송하면 된다.
 */
export function resolveVideoResolution(
  videoModel: string,
  requested?: string | null,
): VideoResolution {
  if (!requested) return DEFAULT_VIDEO_RESOLUTION;
  const allowed = videoResolutionsFor(videoModel);
  return allowed.includes(requested as VideoResolution)
    ? (requested as VideoResolution)
    : DEFAULT_VIDEO_RESOLUTION;
}
