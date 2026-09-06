/**
 * `@csc/video-capabilities`: 영상 모델 역량 공유 커널(런타임 의존성 0)
 *
 * 여기 두는 것: 만들어지는 영상이 어떤 모양인가(화질, 화면비). 프론트가 선택지와 상자를 그리고
 * 백엔드가 같은 표로 clamp/조립해야 하는 값들이다.
 *
 * 여기 두지 않는 것:
 *  - 벤더 단가 → `@csc/pricing` (벤더 일정으로 바뀐다)
 *  - 조직이 무엇에 접근하는가 → `@csc/entitlements` (배포 주기로 바뀐다)
 *  - 픽셀 치수 → video-model `ffmpeg_ops._DIMS` (렌더러 구현이다)
 */

export {
  DEFAULT_VIDEO_RESOLUTION,
  RESOLUTION_KEYS,
  resolveVideoResolution,
  supportsResolutionChoice,
  videoResolutionsFor,
} from './resolutions';
export type { VideoResolution } from './resolutions';

export {
  aspectHeightFactor,
  aspectPromptLabelFor,
  aspectRatioCss,
  imageSizeFor,
  isAspectRatio,
} from './aspect';
export type { AspectRatio } from './aspect';
