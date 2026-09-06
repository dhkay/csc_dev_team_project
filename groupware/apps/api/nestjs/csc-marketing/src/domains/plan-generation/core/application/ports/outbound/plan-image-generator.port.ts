/**
 * 씬 이미지 생성 아웃바운드 포트: 조립된 프롬프트로 이미지 1장을 생성한다.
 * 구현은 language-model 서비스(/inference/images) 호출 어댑터. 벤더 교체 = 어댑터만 바꾼다.
 */

/** 씬 이미지 생성 입력 컨텍스트 */
export interface PlanImageContext {
  // 조직 id: LLM 서버가 외부 벤더(OpenAI) 조직 키를 해석하는 데 쓴다(멀티테넌시)
  organizationId: number;
  // 요청한 사람이 선택한 이미지 생성 모델 id(AiModelSelection.image)
  model: string;
  // 조립된 이미지 프롬프트(스타일 앵커 + 씬 주제)
  prompt: string;
  // 이미지 크기(예: 1024x1024)
  size: string;
  // 이미지 품질(low/medium/high)
  quality: string;
  // 생성 seed: 같은 기획안 씬끼리 동일(내장 FLUX 일관성). 외장 OpenAI 는 무시
  seed: number;
}

/**
 * 이미지 1장의 벤더 토큰 사용량
 * 셋으로 나뉘는 이유: gpt-image 는 토큰 과금이고 단가가 항목별로 달라 합계만으로는 되계산 불가
 */
export interface PlanImageUsage {
  // 실제로 그린 모델 key(요청값이 아니다)
  model: string;
  inputTextTokens: number;
  inputImageTokens: number;
  outputImageTokens: number;
}

/** 생성 결과: base64 이미지 + MIME (+ 과금 근거) */
export interface PlanImageResult {
  b64: string;
  mimeType: string;
  // 토큰 과금 벤더만 채워지고 자체 모델과 구 버전 서버는 둘 다 null
  // 그 구분은 모델 key 가 함(billing 이 'none' 이면 무료, 'org-key' 면 사용량 누락)
  usage: PlanImageUsage | null;
}

// 엔진 부하 타입은 도메인이 소유한다(인바운드 포트도 참조하므로). 여기선 재노출만
export type { PlanImageEngineLoad } from '../../../domain';
import type { PlanImageEngineLoad } from '../../../domain';

export interface PlanImageGeneratorPort {
  generate(context: PlanImageContext): Promise<PlanImageResult>;

  /**
   * 이 모델을 그리는 엔진의 부하(공유 큐). 큐가 없는 벤더는 null.
   * 보조 정보라 조회 실패도 null 로 접는다(생성 흐름을 막지 않는다)
   */
  engineLoad(model: string): Promise<PlanImageEngineLoad | null>;
}

export const PLAN_IMAGE_GENERATOR_PORT = Symbol('PLAN_IMAGE_GENERATOR_PORT');
