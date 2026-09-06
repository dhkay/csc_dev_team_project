/**
 * 마케팅 영상/기획안 미디어 카드 화면비: 어느 비율인지는 버전이 정한다.
 *
 * CSS 리터럴을 따로 적으면 화면의 상자와 실제 영상의 모양이 갈리는데, 카드가 `object-cover` 라
 * 그림은 멀쩡해 보이고 아무도 눈치채지 못한다.
 * 공유 커널의 값 하나를 재노출하는 것도 부족하다. v1.0 의 영상은 배경 프레임 안의 한 자리에 앉고
 * v1.5 의 영상은 화면 전체라 두 버전이 애초에 같은 모양이 아니다.
 * 그래서 값 대신 함수만 둔다. 비율은 파이프라인의 사실(`pipelineFor(v).aspectRatio`)이고 해석은
 * `@csc/video-capabilities` 가 소유하며 이 파일은 둘을 잇는다. 값을 하나 두면 버전을 모르는 자리가
 * 그것을 집어 들고 그 자리만 다른 버전의 모양으로 그린다.
 */
import { pipelineFor } from '@csc/tool-versions';
import { aspectHeightFactor, aspectRatioCss, isAspectRatio } from '@csc/video-capabilities';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';

/** 그 버전이 만드는 영상의 상자 비율(CSS `aspect-ratio` 값) */
export function versionAspectCss(version: VersionMode): string {
  return aspectRatioCss(pipelineFor(version).aspectRatio);
}

/** 그 버전 캔버스의 높이 계수: `높이 = 너비 * 계수`. */
export function versionAspectHeightFactor(version: VersionMode): number {
  return aspectHeightFactor(pipelineFor(version).aspectRatio);
}

/**
 * 행에 굳은 비율로 상자를 그린다(만들어진 영상은 자기 행의 값으로 계속 렌더된다)
 *
 * 이미 만든 영상에 버전 규칙을 다시 적용하지 않는 이유: 규칙이 바뀐 뒤에도 그 영상의 모양은
 * 그대로다. 버전에서 다시 파생하면 옛 영상이 새 규칙의 상자에 담겨 잘려 보인다.
 *
 * 모르는 값에 던지지 않는다. 이 문자열은 DB 컬럼에서 온다(검사 없이 지나온 옛 행, 손으로 고친
 * 행). 던지면 그 카드 하나가 아니라 목록 전체가 그려지지 않는다. 렌더러가 못 알아들은 화면비를
 * 폴백 모양으로 만드는 것과 같은 규칙이라, 상자도 그 폴백으로 그린다.
 */
export function storedAspectCss(ratio: string): string {
  return aspectRatioCss(isAspectRatio(ratio) ? ratio : RENDERER_FALLBACK_RATIO);
}

/**
 * 렌더러가 못 알아들은 화면비를 만들 때 쓰는 모양(`ffmpeg_ops.DEFAULT_ASPECT`)
 * `scripts/check-marketing-aspect.mjs` 가 이 값이 커널의 카탈로그에 있는지 잠근다.
 */
const RENDERER_FALLBACK_RATIO = '9:16';
