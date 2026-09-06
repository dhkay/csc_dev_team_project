import type {
  BriefRefinementPromptContext,
  FocusKeywordPromptContext,
  PlanPromptView,
  PlanSystemPromptContext,
  PlanUserPromptContext,
  PromptSegmentCatalog,
  SceneImageBrand,
  SceneImageSubject,
} from '../../../domain';

/**
 * 파이프라인 이음새 1/3: 기획안 프롬프트 조립
 * 한 버전이 "무엇을 어떻게 지시하는가" 전부를 담고, 파일이 갈려 한쪽만 고치는 것이 안전
 * 구현이 순수 상수 객체인 이유: 협력자가 없고 core 는 프레임워크를 import 하지 않음
 */
export interface PlanPromptAssembler {
  // 이 버전의 기본 편집 지침. 버전마다 다름(그 버전 출력 형식을 전제로 쓰인 문장)
  // promptView 밖에 따로 두는 이유: 서비스가 뷰를 만들지 않고도 이 값을 알아야 함
  readonly defaultInstructions: string;
  // 이 버전의 유저 프롬프트가 효과음 후보를 제시하는가
  // 제시하지 않으면 응답에 그 id 가 올 수 없어 서비스가 후보 목록을 아예 만들지 않음
  // 버전이 아니라 프롬프트의 주인에게 묻는 이유: 그 답이 이 조립기 안에 있음
  readonly offersSceneSfx: boolean;
  /** 시스템 프롬프트(고정 골격 + 편집 지침 + 생성 선택값) */
  systemPrompt(ctx: PlanSystemPromptContext): string;
  /** 유저 프롬프트(채널, 브랜드, 키워드, 오디오 후보. 전부 런타임 값) */
  userPrompt(ctx: PlanUserPromptContext): string;
  /** 씬 이미지 프롬프트. 이미지 모델로 나가는 최종 문자열 */
  sceneImagePrompt(brand: SceneImageBrand, scene: SceneImageSubject): string;
  // 키워드 보완 시스템 프롬프트
  // 어댑터가 조립하면 버전을 알아야 해 "무엇을 보낼지"가 전송 계층으로 새어 듦
  // 조립기를 우회하던 동안 아래 segments() 의 계약이 우연히만 성립했음
  readonly focusKeywordSystemPrompt: string;
  /** 키워드 보완 유저 프롬프트. segments().focusKeyword 와 같은 배열에서 나오는 것이 계약 */
  focusKeywordUserPrompt(ctx: FocusKeywordPromptContext): string;
  // 입력 정제 프롬프트(기획 앞). 정제하지 않는 버전은 던진다(서비스가 파이프라인 표로 먼저 가른다)
  // segments().briefRefinerSystem / briefRefinerUser 와 같은 배열에서 나오는 것이 계약
  briefRefinerSystemPrompt(ctx: BriefRefinementPromptContext): string;
  briefRefinerUserPrompt(ctx: BriefRefinementPromptContext): string;
  /** 편집 화면이 보여줄 고정부와 기본 지침, 이 이미지 모델의 안전 제약 */
  promptView(instructions: string, imageModel: string): PlanPromptView;
  /** 프로세스 화면이 그릴 정의. 위 조립과 같은 배열을 돌려주는 것이 계약 */
  segments(): PromptSegmentCatalog;
}

// DI 토큰: VersionRegistry<PlanPromptAssembler>
export const PLAN_PROMPT_ASSEMBLERS = Symbol('PLAN_PROMPT_ASSEMBLERS');
