// 프로세스 뷰가 세그먼트를 노드로 옮길 때 넘기는 컨텍스트. 두 버전이 공유한다.
// 뷰는 template 을 보여주고 note 만 컨텍스트로 판정하며, note 를 갈라 쓰는 필드는 둘뿐이다.
// (채널이 고른 이미지 모델과 작업자 편집 지침). 나머지는 화면에 닿지 않아 아무 값도 지어내지 않는다.
import type {
  BriefRefinementPromptContext,
  PlanSystemPromptContext,
  PlanUserPromptContext,
} from '../prompt/context';

// 자리 채우기 개수. 표시용 컨텍스트라 0 이 맞다(그럴듯한 수는 그 버전의 사실처럼 읽힌다)
const VIEW_PLACEHOLDER_COUNT = 0;

/**
 * 시스템 프롬프트 뷰 컨텍스트. 채널 상태만 실제 값이고 나머지는 자리 채우기
 * 선택 플래그를 전부 참으로 두는 이유: 뷰가 가장 흔한 경로를 기준으로 보여줌
 */
export function systemViewContext(
  instructions: string,
  imageModel: string,
): PlanSystemPromptContext {
  return {
    instructions,
    imageModel,
    proposalCount: VIEW_PLACEHOLDER_COUNT,
    sceneCount: VIEW_PLACEHOLDER_COUNT,
    excludeInfographic: false,
    hasPurposeKeywords: true,
    hasBrand: true,
    hasConcepts: true,
  };
}

/** 유저 프롬프트 뷰 컨텍스트. 전부 런타임 값이라 표시할 실제 값이 없음 */
export const USER_VIEW_CONTEXT: PlanUserPromptContext = {
  channelName: '',
  brand: { name: '', description: '', concepts: [] },
  purposeKeywords: [],
  sceneBrief: '',
  constraints: '',
  // 후보 목록은 비워 둠. 효과음은 키도 두지 않음(빈 배열은 '제시하는데 후보가 없다'로 읽힘)
  bgmCandidates: [],
  proposalCount: VIEW_PLACEHOLDER_COUNT,
};

/** 입력 정제 프롬프트 뷰 컨텍스트. 두 절이 전부 작업자 원문이라 표시할 실제 값이 없음 */
export const BRIEF_REFINER_VIEW_CONTEXT: BriefRefinementPromptContext = {
  sceneBrief: '',
  constraints: '',
};
