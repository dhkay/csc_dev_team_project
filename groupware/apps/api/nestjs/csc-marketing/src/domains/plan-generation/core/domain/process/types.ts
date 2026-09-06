// 프로세스 뷰의 어휘. 선언만 두고 단계 구성은 버전별 파일이 가짐
// 파이프라인을 제작 단계로 나누고 각 단계의 실제 스텝을 실행 순서대로 노드화한 읽기전용 구조
// 프롬프트 노드는 나열하지 않고 실제 조립 세그먼트에서 파생(segment-nodes.ts)해 화면이 자동 추종
import type { PromptNodeKind } from '../prompt-segment';
import type { PromptSegmentCatalog } from '../prompt-catalog';

/** 프롬프트 세그먼트 노드 1개. content 는 실제 값이거나 템플릿 플레이스홀더 */
export interface PromptNode {
  id: string;
  // 화면 표시 제목(한국어)
  title: string;
  kind: PromptNodeKind;
  // 실제 프롬프트 원문 또는 구조 플레이스홀더
  content: string;
  // 조건과 런타임 주입 표기. 본문과 별개의 '언제 들어가나'
  note?: string;
  // 이 노드가 참조하는 다른 노드 id. 시스템 규칙 → 유저 데이터 방향으로 정의
  links?: string[];
}

/** 프롬프트 하나(한 레인) */
export interface PromptPhase {
  id: string;
  title: string;
  subtitle?: string;
  nodes: PromptNode[];
}

/** 스텝 실행 특성: 순차(앞 결과에 의존) 또는 병렬(팬아웃) */
export type StepExecution = 'sequential' | 'parallel';

/**
 * 프롬프트 주입 이벤트: 언제, 몇 번, 어떻게 프롬프트가 모델에 들어가는지
 * 개념적으로 붙이는 대신 실제 런타임 호출의 타이밍을 드러냄
 */
export interface PromptInjection {
  // 한 줄 요약(항상 표시)
  summary: string;
  // 무엇이 이 프롬프트를 받는가(실제 전송 대상)
  target: string;
  // 몇 번, 어떤 카디널리티로 발생하는가
  cardinality: string;
  // 파이프라인의 어느 지점에서 나가는가
  timing: string;
  // 어떻게 조립되어 나가는가(메시지 role, 단일 프롬프트 등)
  assembly: string;
  // 조건부일 때만. 어떤 조건에서 나가는가
  condition?: string;
  // 이 입력으로 모델이 무엇을 산출하는가
  output?: string;
}

/** 스텝 내부 실행 하위단계. 프롬프트가 중간에 주입되는 지점을 드러냄 */
export interface ProcessSubstep {
  id: string;
  title: string;
  // 이 하위단계에서 프롬프트가 주입되는가
  injectsPrompt?: boolean;
  note?: string;
}

/**
 * 파이프라인 스텝 1개. execution 으로 순차와 병렬을 표기
 * usesPrompt=true 면 prompts 와 injection 을 담고, false 면 note 로 프롬프트가 없는 이유를 설명
 */
export interface ProcessStep {
  id: string;
  title: string;
  subtitle?: string;
  execution: StepExecution;
  usesPrompt: boolean;
  // 이 스텝에서 주입되는 프롬프트 세그먼트(조립 순서). usesPrompt=false 면 빈 배열
  prompts: PromptPhase[];
  // 프롬프트 주입 이벤트. usesPrompt=true 인 스텝만 채움
  injection?: PromptInjection;
  // 스텝 내부 실행 하위단계
  substeps?: ProcessSubstep[];
  // 스텝이 하는 일과 순차/병렬 상세, 프롬프트가 없는 이유
  note?: string;
}

/** 제작 단계(파트). 단계 안의 스텝을 실행 순서대로 담음 */
export interface ProcessStage {
  id: string;
  title: string;
  subtitle?: string;
  steps: ProcessStep[];
}

/** 프로세스 전체. 그 버전의 제작 단계로 나눈 파이프라인 */
export interface ProcessView {
  stages: ProcessStage[];
}

/**
 * video-model 이 서빙하는 자기 프롬프트 서술. 그 서버가 원문의 주인이라 여기서 복제하지 않음
 * 베껴 두면 그 서버를 고쳤을 때 화면이 조용히 옛 값을 보여준다.
 */
export interface VideoModelPromptDescriptor {
  // 씬 모션 프롬프트. 씬 이미지가 있는 씬의 AI 모션 provider 에 공통으로 나감
  sceneMotion: {
    content: string;
  };
  // 대사 지시. `{line}` 자리에 그 세그먼트의 대화내용이 들어가고 구 버전 서버는 주지 않아 선택
  sceneDialogue?: {
    content: string;
  };
  // 나레이션 지시. 대사 지시와 같은 이유로 선택
  sceneNarration?: {
    content: string;
  };
}

/**
 * 프로세스 뷰 입력. version 이 없는 이유는 버전별 빌더를 표에서 골라 부르기 때문
 * 레지스트리 키가 곧 버전이라 빠뜨린 호출이 다른 버전 구성을 그리는 상태를 만들 수 없음
 */
export interface BuildProcessViewInput {
  // 채널의 현재 유효 작업자 지침(비면 기본 지침). editable 노드 note 판정용
  instructions: string;
  // 채널이 고른 이미지 모델 id. 이미지 안전 제약 노드의 활성 여부 판정용
  imageModel: string;
  // 이 버전이 입력 정제에 쓰는 모델 id(파이프라인 표). 정제하지 않는 버전은 null
  // 빌더가 표를 다시 읽지 않고 받는 이유는 imageModel 과 같다(채널/버전 상태는 서비스가 해석한다)
  briefRefinerLlm: string | null;
  // 이 버전의 세그먼트 정의. 실제 조립과 같은 배열이어야 한다는 계약은 조립기 포트가 지킴
  segments: PromptSegmentCatalog;
  // video-model 이 내려준 자기 프롬프트 서술. 조회 실패 시 null 이고 폴백 사용
  videoModel?: VideoModelPromptDescriptor | null;
}
