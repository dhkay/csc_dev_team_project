import type { FocusKeywordPromptContext } from './focus-keyword-prompt';
import type { SceneImagePromptContext } from './plan-image-prompt';
import type {
  BriefRefinementPromptContext,
  PlanSystemPromptContext,
  PlanUserPromptContext,
} from './prompt/context';
import type { PromptSegmentDef } from './prompt-segment';

/**
 * 한 버전의 프롬프트 세그먼트 정의 묶음
 * 도메인에 두는 이유: 프로세스 뷰가 인자로 받아, 포트에 두면 계층이 뒤집힘
 * 조립 엔진이 아니라 별도 파일인 이유는 순환(컨텍스트가 사는 파일들이 그 엔진을 import)
 * 필드를 나열하는 이유: 프롬프트가 몇 벌인지 자체가 구조라 늘면 버전 구현 전부가 컴파일로 알게 됨
 */
export interface PromptSegmentCatalog {
  system: readonly PromptSegmentDef<PlanSystemPromptContext>[];
  user: readonly PromptSegmentDef<PlanUserPromptContext>[];
  sceneImage: readonly PromptSegmentDef<SceneImagePromptContext>[];
  focusKeyword: readonly PromptSegmentDef<FocusKeywordPromptContext>[];
  // 입력 정제(기획 앞). 정제하지 않는 버전은 둘 다 빈 배열(그 버전에서 한 번도 나가지 않는 프롬프트)
  briefRefinerSystem: readonly PromptSegmentDef<BriefRefinementPromptContext>[];
  briefRefinerUser: readonly PromptSegmentDef<BriefRefinementPromptContext>[];
}
