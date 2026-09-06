import { pipelineFor } from '@csc/tool-versions';
import type { ToolVersion } from './tool-version';

/**
 * 버전별 파이프라인 사실. 값의 주인은 `@csc/tool-versions` 이고 여기서는 이 서버 어휘로 재노출
 * 계약 문서: docs/specs/marketing-tool-versions.md
 */
export type { ToolVersionPipeline } from '@csc/tool-versions';
export { pipelineFor, TOOL_VERSION_PIPELINES } from '@csc/tool-versions';
// 버전과 무관한 한계(동영상 수 상한, 그 오류 코드와 안내). 화면과 같은 출처
export { MAX_SEGMENTS_PER_VIDEO, SEGMENT_LIMIT_EXCEEDED, segmentLimitMessage } from '@csc/tool-versions';

/**
 * 이 버전이 실제로 쓰는 기획 LLM. 고정 모델이 있으면 개인 설정값을 무시
 * 표의 사실이 아니라 이 서버의 규칙(저장값과 고정값 중 무엇을 이기게 할지)이라 커널이 아닌 여기 위치
 */
export function planLlmForVersion(version: ToolVersion, storedLlm: string): string {
  return pipelineFor(version).pinnedPlanLlm ?? storedLlm;
}

/**
 * 이 버전이 실제로 쓰는 이미지 모델. 씬 이미지를 만들지 않는 버전은 저장값을 없는 것으로 취급
 * 읽는 자리가 넷(생성, 프롬프트 뷰, 프로세스 뷰, 엔진 부하)이라 한 함수로 모음
 */
export function imageModelForVersion(version: ToolVersion, storedImageModel: string): string {
  return pipelineFor(version).usesSceneImages ? storedImageModel : '';
}

/**
 * 이 버전이 실제로 만들 기획안 수. 고정하는 버전은 요청값을 무시
 * 거절 대신 이김(화면에 개수를 고를 자리가 없어 400 은 없는 UI 의 실패 경로)
 * 다만 요청값이 고정값과 다르면 호출부가 로그로 남김(화면 쪽 회귀를 신호 없이 지나치지 않도록)
 */
export function proposalCountForVersion(version: ToolVersion, requested: number): number {
  return pipelineFor(version).pinnedProposalCount ?? requested;
}
