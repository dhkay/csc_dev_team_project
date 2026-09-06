import { PlanProposalEntity, PlanPromptView, ProcessView, PlanImageEngineLoad } from '../../../domain';
import type {
  OwnerVersionScope,
  WorkspaceScope,
} from '../../../../../../shared/domain/workspace-scope';
import type { ConceptChoice } from '../../../../../channel-settings/core/domain';

/**
 * 포커스 키워드 후보 한 건
 * origin 이 계약의 핵심(collected 는 실제 검색어, generated 는 모델이 지어낸 말)
 * 화면이 둘을 구분해야 작업자가 실측과 추정을 같은 무게로 고르지 않음
 */
export interface FocusKeywordCandidate {
  keyword: string;
  origin: 'collected' | 'generated';
  // collected 일 때 어느 소스에서 왔는가(화면 배지)
  source?: { key: string; label: string };
  // 그 값을 주는 소스에서만. 고를 근거로 화면에 표시
  monthlySearches?: number;
}

/** 씬 이미지 1장 생성 입력 */
export interface SceneImageInput {
  // 선택 브랜드/컨셉. 스타일 앵커의 근거를 그 사람의 세트에서 찾음
  brandName: string;
  // 그 기획안을 만들 때 쓴 연출 축 조합(저장된 스냅샷). 미지정이면 세트의 현재 조합
  // 조합은 생성 때 임의로 바뀌고 세트에 저장되지 않아 재조회하면 연출이 어긋남
  concepts?: ConceptChoice[];
  // 씬의 시각 브리프. 화면에 담기는 내용의 전부이고 자막과 나레이션의 의미가 이미 접혀 있음
  // 그래서 원문을 따로 받지 않음(넣으면 모델이 문자 그대로 그릴 대상으로 읽음)
  imagePrompt: string;
  // 소속 기획안 제목. seed 계산에만 쓰고 프롬프트에는 넣지 않음(마케팅 헤드라인이라 그릴 대상이 됨)
  proposalTitle?: string;
  // 재시도 변주 번호(기본 0). 같은 씬을 다른 seed 로 재생성
  variant?: number;
}

/**
 * 기획안 생성 결과. 배열이 아니라 봉투인 이유는 모델 이름 하나
 * 배열만 돌려주면 저장이 어느 모델로 만들어졌는지 몰라 저장 시점 설정을 다시 읽게 됨
 * 이 값이 활동 원장에 쓰는 값과 같은 변수라 원장과 저장 행이 갈릴 수 없음
 */
export interface GeneratedPlans {
  proposals: PlanProposalEntity[];
  // 이 생성이 실제로 부른 기획 LLM(응답이 밝힌 모델 ?? 요청 모델)
  llmModel: string;
}

/**
 * 기획서 생성 Inbound Port: 수집 데이터와 채널 설정을 컨텍스트로 조립해 LLM 에 위임
 * 이 도메인이 소유하는 것은 프롬프트 조립 규칙과 그 결과이고 기획안은 저장하지 않는 휘발성
 * 스코프에 버전이 있는 이유: 조립 규칙과 모델 슬롯이 버전마다 갈림
 */
export interface PlanGenerationPort {
  /**
   * 수집 데이터로 기획안 생성. 목적 키워드는 저장하지 않고 요청에 실려 옴
   * 개수는 사용자 선택이고 서비스가 범위 clamp. 채널 부재와 미등록 brandName 은 NotFound
   * 수집 소스 인사이트는 best-effort(실패는 빈 목록으로 degrade)
   */
  generatePlans(
    scope: WorkspaceScope,
    // 이번 생성의 브랜드/컨셉 세트 이름
    // 빈 문자열이면 세트를 고르지 않은 경로(주제와 연출이 sceneBrief 에서 나옴)
    // 비어 있지 않은데 그 사람 세트에 없으면 NotFound
    brandName: string,
    // 이번 생성에 쓸 목적 키워드(키워드 검색 화면에서 고른 것). 상한은 FOCUS_KEYWORD_MAX
    // 빈 배열이면 브랜드가 주제가 됨(키워드는 선택)
    purposeKeywords: string[],
    proposalCount: number,
    // 씬(세그먼트) 수. 입력을 정제하는 버전에서 sceneBrief 를 적었으면 정제가 확정한 동영상 수가
    // 이 값을 이긴다(화면의 셈은 번호 표기에 의존한 어림값이다). 그 외에는 이 값을 clamp 해 쓴다.
    sceneCount: number,
    excludeInfographic?: boolean,
    // 이번 생성에만 쓰는 연출 축 조합. 미지정이면 세트에 저장된 조합
    // 세트를 수정하지 않음(실험 한 번이 설정에 남으면 이전 조합을 잃음)
    // 카탈로그에 없는 축이나 옵션이면 400(프롬프트에 넣을 문구가 없음)
    concepts?: ConceptChoice[],
    // 작업자가 직접 적은 씬 구성과 요구사항. 공백만이면 없는 것으로 봄
    // 정제하는 버전(파이프라인 표의 briefRefinerLlm)에서는 원문이 아니라 정제본이 기획 프롬프트에 실린다.
    // 정제에 실패하면 생성이 실패한다(원문으로 조용히 진행하지 않는다). 정제 결과가 동영상 상한을
    // 넘으면 400(code SEGMENT_LIMIT_EXCEEDED)이고 합쳐서 맞추지 않는다.
    sceneBrief?: string,
    // 작업자가 직접 적은 제한사항. 공백만이면 없는 것으로 봄. 정제 규칙은 sceneBrief 와 같다.
    constraints?: string,
  ): Promise<GeneratedPlans>;

  /**
   * 씬 이미지 1장 생성. 기획안이 휘발성이라 결과는 inline data URL
   * 이미지 모델 미설정은 BadRequest, 미등록 brandName 은 NotFound
   * prompt 는 실제로 모델에 보낸 최종 조립 결과(프론트가 흉내내면 실물과 조용히 어긋남)
   */
  generateSceneImage(
    scope: WorkspaceScope,
    input: SceneImageInput,
  ): Promise<{ dataUrl: string; prompt: string }>;

  /**
   * 포커스 키워드 후보 생성. 씨앗 한 줄로 후보 목록을 만들고 저장하지 않음
   * 수집이 먼저이고 LLM 은 모자란 만큼만 채움. 채널 부재는 NotFound
   */
  suggestFocusKeywords(
    scope: WorkspaceScope,
    seed: string,
  ): Promise<FocusKeywordCandidate[]>;

  /**
   * 이미지 생성 엔진 부하. 자체 호스팅이면 큐 현황, 외부 벤더면 null
   * 모델에서 엔진을 판단하는 것은 LLM 서버라 여기선 고른 모델만 넘김
   * 채널은 받지 않고(부하는 채널과 무관) 버전은 받음(모델이 버전 슬롯에 있음)
   */
  getSceneImageEngineLoad(
    scope: OwnerVersionScope,
  ): Promise<PlanImageEngineLoad | null>;

  /**
   * 기획서 생성 프롬프트 뷰: 고정 머리와 꼬리 + 편집 가능한 중간 지침 + 기본값
   * 편집분이 없으면 instructions 가 기본 지침
   */
  getPlanPrompt(scope: WorkspaceScope): Promise<PlanPromptView>;
  /** 편집 지침 저장(빈 값이면 기본값으로 리셋) 후 뷰 반환 */
  setPlanPrompt(scope: WorkspaceScope, instructions: string): Promise<PlanPromptView>;
  /** 프로세스 뷰(읽기전용). 파이프라인을 제작 3단계와 실행 스텝으로 노드화 */
  getProcessView(scope: WorkspaceScope): Promise<ProcessView>;
}
export const PLAN_GENERATION_PORT = Symbol('PLAN_GENERATION_PORT');
