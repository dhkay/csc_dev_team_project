/**
 * `@csc/tool-versions`: 마케팅 영상 도구의 버전 축 단일 출처(무의존 공유 커널)
 *
 * 담는 것은 셋이다.
 *   값 공간       어떤 버전이 있는가, 기본은 무엇인가, 모르는 값을 어떻게 다루는가
 *   파이프라인    그 버전이 무엇을 만들고 무엇을 만들지 않는가
 *   한계          버전과 무관하게 하나인 상한과 그것을 말하는 문장(동영상 수)
 *
 * 소비자는 셋이다. csc-marketing(요청 검증, 파이프라인 분기, 프로세스 서술), web-groupware(라우트
 * 축, AI 역량 노출, 가격표), 그리고 그 둘 사이를 잇는 BFF. 대조할 사본을 두지 않는다.
 *
 * 프레임워크를 import 하지 않는다(무의존). 요청을 400 으로 거절하는 일처럼 프레임워크가 필요한
 * 결정은 소비자 쪽 얇은 재노출 계층이 감싼다(csc-marketing 의 `shared/domain/tool-version.ts`)
 */
export type { ToolVersion, ToolVersionRecord } from './versions';
export {
  TOOL_VERSIONS,
  DEFAULT_TOOL_VERSION,
  asToolVersion,
  toolVersionOrDefault,
} from './versions';

export type { ToolVersionPipeline } from './pipeline';
export { TOOL_VERSION_PIPELINES, pipelineFor } from './pipeline';

export { MAX_SEGMENTS_PER_VIDEO, SEGMENT_LIMIT_EXCEEDED, segmentLimitMessage } from './limits';
