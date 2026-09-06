import type { PlanPromptAssembler } from '../../../application/ports/outbound/plan-prompt-assembler.port';
import type { PromptSegmentCatalog } from '../../prompt-catalog';
import { assembleSegments } from '../../prompt-segment';
import {
  FOCUS_KEYWORD_SEGMENTS,
  FOCUS_KEYWORD_SYSTEM_PROMPT,
  buildFocusKeywordUserPrompt,
} from '../../focus-keyword-prompt';
import {
  V15_BRIEF_REFINER_SYSTEM_SEGMENTS,
  V15_BRIEF_REFINER_USER_SEGMENTS,
} from './brief-refiner';
import {
  V15_DEFAULT_PLAN_INSTRUCTIONS,
  V15_FOOTER,
  V15_HEADER_KEYWORD,
  V15_SYSTEM_SEGMENTS,
} from './system';
import { V15_USER_SEGMENTS } from './user';

/**
 * v1.5 프롬프트 파이프라인: 영상 한 편이 목적지인 구성
 *
 * 이 버전은 자체 프롬프트 정의를 갖는다. 산출물의 모양이 v1.0 과 갈리기 때문이고
 * (씬 = 장면 구성 + 대화내용) 그 근거는 `system.ts` 머리 주석에 있다.
 * 씬 이미지 자리는 둘 다 비어 있다. 이 버전은 씬 이미지를 만들지 않아
 * (`pipelineFor('v1.5').usesSceneImages === false`) 그 경로가 서비스에서 400 으로 막힌다.
 * v1.0 의 것으로 채우지 않는 이유: 세그먼트 배열은 프로세스 화면이 읽어, 이 버전에서 한 번도
 * 나가지 않는 프롬프트를 나가는 것처럼 보여주게 된다.
 * 함수 쪽도 같은 이유로 위임하지 않고 던진다. 도달하는 날 필요한 것은 그럴듯한 문자열이 아니라
 * 여기 구현이 없다는 사실이다(v1.0 의 씬은 소스 방향과 자막을 갖고 이 버전의 씬은 그렇지 않다)
 * 입력 정제 프롬프트는 이 버전에만 있다(직접 적는 칸이 이 버전에만 있다).
 */
const CATALOG: PromptSegmentCatalog = {
  system: V15_SYSTEM_SEGMENTS,
  user: V15_USER_SEGMENTS,
  sceneImage: [],
  focusKeyword: FOCUS_KEYWORD_SEGMENTS,
  briefRefinerSystem: V15_BRIEF_REFINER_SYSTEM_SEGMENTS,
  briefRefinerUser: V15_BRIEF_REFINER_USER_SEGMENTS,
};

export const PLAN_PROMPT_ASSEMBLER_V15: PlanPromptAssembler = {
  defaultInstructions: V15_DEFAULT_PLAN_INSTRUCTIONS,
  // 이 버전의 세그먼트에는 효과음 자리가 없다. 유저 프롬프트가 BGM 후보만 제시한다.
  offersSceneSfx: false,
  systemPrompt: (ctx) => assembleSegments(CATALOG.system, ctx),
  userPrompt: (ctx) => assembleSegments(CATALOG.user, ctx),
  sceneImagePrompt: () => {
    // 서비스가 이 버전의 씬 이미지 요청을 400 으로 먼저 막는다(도달 불가). 그 가드가 사라지는 날
    //   이 예외가 그 사실을 즉시 알린다.
    throw new Error('v1.5 는 씬 이미지를 만들지 않습니다.');
  },
  // 키워드 보완 프롬프트: 두 버전이 아직 같은 배열을 가리킨다. 갈릴 수 있게 만드는 것과
  //   갈리는 것은 다른 일이다. 이 슬롯이 열려 있으면 한 버전만 자기 문구를 갖는 날 서비스와
  //   어댑터를 고치지 않는다(그리고 그때 프로세스 화면이 자동으로 따라온다)
  focusKeywordSystemPrompt: FOCUS_KEYWORD_SYSTEM_PROMPT,
  focusKeywordUserPrompt: (ctx) => buildFocusKeywordUserPrompt(ctx),
  briefRefinerSystemPrompt: (ctx) => assembleSegments(CATALOG.briefRefinerSystem, ctx),
  briefRefinerUserPrompt: (ctx) => assembleSegments(CATALOG.briefRefinerUser, ctx),
  promptView: (instructions) => ({
    header: V15_HEADER_KEYWORD,
    footer: V15_FOOTER,
    defaultInstructions: V15_DEFAULT_PLAN_INSTRUCTIONS,
    instructions,
    // 이미지 안전 제약은 씬 이미지를 만드는 버전의 것이다. 이 버전에는 걸릴 벤더가 없다.
    imageSafetyDirective: '',
  }),
  segments: () => CATALOG,
};
