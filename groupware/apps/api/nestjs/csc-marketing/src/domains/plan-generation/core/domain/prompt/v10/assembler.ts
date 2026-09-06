import type { PlanPromptAssembler } from '../../../application/ports/outbound/plan-prompt-assembler.port';
import type { PromptSegmentCatalog } from '../../prompt-catalog';
import { assembleSegments } from '../../prompt-segment';
import {
  FOCUS_KEYWORD_SEGMENTS,
  FOCUS_KEYWORD_SYSTEM_PROMPT,
  buildFocusKeywordUserPrompt,
} from '../../focus-keyword-prompt';
import { SCENE_IMAGE_SEGMENTS, buildSceneImagePrompt } from '../../plan-image-prompt';
import {
  DEFAULT_PLAN_INSTRUCTIONS,
  PLAN_SYSTEM_FOOTER,
  PLAN_SYSTEM_HEADER,
  PLAN_SYSTEM_SEGMENTS,
  resolveImageSafetyDirective,
} from './system';
import { PLAN_USER_SEGMENTS, buildPlanUserPrompt } from './user';

/**
 * v1.0 프롬프트 파이프라인: 제작 3단계를 사람이 순서대로 밟는 구성
 *
 * 프롬프트 본문은 같은 폴더의 `system.ts` 와 `user.ts` 가 갖는다. v1.5 는 자체 정의를 가지므로
 * (`prompt/v15/`) 이 파일을 고치는 것은 v1.0 만 고치는 일이다.
 * 상속으로 묶지 않는 이유: 기반 클래스를 두면 한 버전을 고치려는 사람이 다른 버전에 무슨 일이
 * 생기는지 먼저 이해해야 하고, 그 협상이 두 버전을 별개 제품으로 두기로 한 결정과 어긋난다.
 */
const CATALOG: PromptSegmentCatalog = {
  system: PLAN_SYSTEM_SEGMENTS,
  user: PLAN_USER_SEGMENTS,
  sceneImage: SCENE_IMAGE_SEGMENTS,
  focusKeyword: FOCUS_KEYWORD_SEGMENTS,
  // 이 버전은 직접 적는 칸이 없어 정제할 입력이 없다(`pipelineFor('v1.0').briefRefinerLlm === null`)
  //   비워 두는 이유는 v1.5 의 씬 이미지 자리와 같다: 프로세스 화면이 이 배열을 읽는다.
  briefRefinerSystem: [],
  briefRefinerUser: [],
};

export const PLAN_PROMPT_ASSEMBLER_V10: PlanPromptAssembler = {
  defaultInstructions: DEFAULT_PLAN_INSTRUCTIONS,
  // 이 버전의 씬에는 효과음 자리가 있다(유저 프롬프트가 후보를 제시하고 파서가 고른 id 를 푼다)
  offersSceneSfx: true,
  systemPrompt: (ctx) => assembleSegments(CATALOG.system, ctx),
  userPrompt: (ctx) => buildPlanUserPrompt(ctx),
  sceneImagePrompt: (brand, scene) => buildSceneImagePrompt(brand, scene),
  // 키워드 보완 프롬프트: 두 버전이 아직 같은 배열을 가리킨다. 갈릴 수 있게 만드는 것과
  //   갈리는 것은 다른 일이다. 이 슬롯이 열려 있으면 한 버전만 자기 문구를 갖는 날 서비스와
  //   어댑터를 고치지 않는다(그리고 그때 프로세스 화면이 자동으로 따라온다)
  focusKeywordSystemPrompt: FOCUS_KEYWORD_SYSTEM_PROMPT,
  focusKeywordUserPrompt: (ctx) => buildFocusKeywordUserPrompt(ctx),
  // 서비스가 파이프라인 표(briefRefinerLlm === null)를 보고 이 버전에서는 부르지 않는다(도달 불가).
  //   v1.5 것으로 채우지 않는 이유는 그 버전의 sceneImagePrompt 와 같다: 도달하는 날 필요한 것은
  //   그럴듯한 문자열이 아니라 여기 구현이 없다는 사실이다.
  briefRefinerSystemPrompt: () => {
    throw new Error('v1.0 은 입력을 정제하지 않습니다.');
  },
  briefRefinerUserPrompt: () => {
    throw new Error('v1.0 은 입력을 정제하지 않습니다.');
  },
  promptView: (instructions, imageModel) => ({
    header: PLAN_SYSTEM_HEADER,
    footer: PLAN_SYSTEM_FOOTER,
    defaultInstructions: DEFAULT_PLAN_INSTRUCTIONS,
    instructions,
    imageSafetyDirective: resolveImageSafetyDirective(imageModel),
  }),
  segments: () => CATALOG,
};
