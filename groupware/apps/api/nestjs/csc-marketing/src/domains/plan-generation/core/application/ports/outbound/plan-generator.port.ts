import { PlanProposalEntity } from '../../../domain';

/**
 * 오디오 에셋 후보(BGM, SFX). LLM 이 태그를 보고 id 로 고를 수 있게 프롬프트에 싣는 항목
 * uploadId 는 프롬프트에 노출하지 않고 파서가 선택된 id 를 스냅샷으로 enrich 할 때만 사용
 */
export interface AudioAssetCandidate {
  id: number;
  name: string;
  uploadId: string;
  // value 는 영문 AI 매칭 키(분위기, 템포, 장르 등 축별 값)
  tags: { axisKey: string; value: string }[];
}

/**
 * 기획서 생성 입력 컨텍스트. 프롬프트 재료를 다시 싣지 않음
 *
 * 브랜드와 컨셉, 목적 키워드, 씬 입력은 이미 조립된 userPrompt 안에 있음
 * 계약이 재료를 선언하면 읽지 않는 필드가 계약처럼 보여 새 어댑터가 조립을 다시 할 수 있다고 오해함
 * 수집 데이터도 들어오지 않음(수집은 키워드 단계에서 끝나고 기획서는 고른 키워드만 받음)
 */
export interface PlanGenerationContext {
  // 조립이 끝난 시스템과 유저 프롬프트
  // 어댑터가 아니라 서비스가 조립하는 이유: 조립 규칙이 버전마다 갈려 전송 계층에 새어 들면 안 됨
  systemPrompt: string;
  userPrompt: string;
  // 조직 id. LLM 서버가 외부 벤더 조직 키를 해석하는 데 사용(멀티테넌시)
  organizationId: number;
  // 생성할 기획안 개수(사용자 선택, 서비스에서 clamp)
  proposalCount: number;
  // 기획안당 씬 개수(사용자 선택, 서비스에서 clamp)
  sceneCount: number;
  // 이 버전이 실제로 부를 LLM 모델 id. 빈 값이면 LLM 서버 기본 모델
  model: string;
  // 이 조직이 쓸 수 있는 BGM 후보(태그 포함). 비면 bgm 미배정이고 렌더에서 강제
  bgmCandidates: AudioAssetCandidate[];
  // 효과음 후보. BGM 과 같은 쓰임이고 효과음 자리가 있는 버전만 받음
  // 후보를 제시하지 않은 프롬프트의 응답에는 그 id 가 올 수 없어 부재가 곧 그 사실
  sfxCandidates?: AudioAssetCandidate[];
}

/**
 * 생성 1회의 벤더 사용량(도메인 표현)
 * HTTP 의 prompt/completion 을 그대로 쓰지 않는 이유: 포트가 벤더 스키마에 종속되면 안 됨
 */
export interface PlanGenerationUsage {
  // 실제로 응답한 모델 key. 요청이 빈 값이어도 서버가 고른 모델이 옴
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * 생성 결과: 기획안 + 사용량
 * 사용량을 결과에 실은 이유: 타입 경계에서 버리면 조직별 LLM 비용의 근거가 없어짐
 */
export interface PlanGenerationResult {
  proposals: PlanProposalEntity[];
  // 구 버전 language-model(롤링 배포 중)이면 null. 0 으로 위장하지 않음
  usage: PlanGenerationUsage | null;
  // 어댑터가 요청 전에 계산한 출력 토큰 추정치(maxTokens 산정용)
  // 실측 옆에 함께 기록해 손으로 튜닝된 추정 상수의 피드백 루프를 만듦
  estimatedOutputTokens: number;
}

/**
 * 기획서 생성 아웃바운드 포트. 컨텍스트로 기획안을 생성
 * 구현은 language-model 호출(버전별 어댑터)이고 교체는 배선 표 한 줄
 */
export interface PlanGeneratorPort {
  generate(context: PlanGenerationContext): Promise<PlanGenerationResult>;
}

/**
 * 버전별 기획 생성기(파이프라인 이음새). 새 버전은 배선 표 한 줄
 * 조립기는 "무엇을 물을지", 이 포트는 "어떻게 묻고 답을 어떻게 읽을지"를 소유
 * VersionRegistry 가 exhaustive 라 표를 안 채우면 컴파일이 막고 읽는 쪽은 늘 같은 한 줄
 */
export const PLAN_GENERATORS = Symbol('PLAN_GENERATORS');
