// 두 버전이 공유하는 프롬프트 입출력 형태. 문구는 하나도 없다.
// 형태를 갈라 두면 문구는 각자 갖고 계약만 공유하며, 이 파일은 어느 버전 폴더도 import 하지 않는다.
// 두 버전이 같은 재료로 같은 조립 엔진에 넘기므로 갈리는 것은 무엇을 말하는가이지 재료의 모양이 아니다.
import type { ConceptSelection } from '../brand-concept';

/** 시스템 프롬프트 조립 입력: 채널 편집 지침 + 생성 시 선택값 */
export interface PlanSystemPromptContext {
  // 작업자 편집 지침(빈 값이면 기본 지침)
  instructions: string;
  proposalCount: number;
  sceneCount: number;
  // 인포그래픽 배제. 배제 지시 추가 + FOOTER 스키마에서 infographic 제거
  excludeInfographic: boolean;
  // 채널이 고른 이미지 모델 id. 안전 제약 활성 여부 판정용
  imageModel: string;
  // 이번 생성에 목적 키워드가 있는가. 있으면 그것이 주제이고 없으면 브랜드가 주제
  // 문자열은 유저 프롬프트가 나르고 시스템 프롬프트는 어느 쪽을 주제로 삼을지만 정함
  hasPurposeKeywords: boolean;
  // 이번 생성에 브랜드가 있는가. 키워드도 브랜드도 없는 경로가 생겨 필요해진 값
  // 그때 주제는 작업자가 적은 씬 입력 본문이고, 이 값을 쓰지 않는 버전은 늘 참
  hasBrand: boolean;
  // 이번 생성에 연출 성격(컨셉 축)이 하나라도 있는가. 브랜드를 골라도 축은 비울 수 있어 hasBrand 와 별개
  // 연출을 화면과 말에 매는 고정 지시가 이 값으로 갈린다. 그 지시가 없는 버전은 읽지 않음
  hasConcepts: boolean;
}

/** 오디오 후보 한 건. 프롬프트에 `id | name | axisKey=value, ...` 로 실림 */
export interface AudioCandidateLine {
  id: number;
  name: string;
  tags: { axisKey: string; value: string }[];
}

/** 유저 프롬프트 조립 입력. 전부 생성 시점 런타임 값 */
export interface PlanUserPromptContext {
  channelName: string;
  brand: {
    name: string;
    description: string;
    concepts: ConceptSelection[];
  };
  purposeKeywords: string[];
  // 작업자가 직접 적은 씬 구성과 요구사항(trim 완료). 빈 문자열은 미입력
  sceneBrief: string;
  // 작업자가 직접 적은 제한사항(trim 완료). 빈 문자열은 미입력
  constraints: string;
  bgmCandidates: AudioCandidateLine[];
  // 효과음 후보. 효과음 자리가 있는 버전만 받음
  sfxCandidates?: AudioCandidateLine[];
  proposalCount: number;
}

/**
 * 입력 정제 프롬프트 조립 입력: 작업자가 적은 원문 둘(trim 완료). 빈 문자열은 미입력
 * 정제기는 채널도 브랜드도 받지 않는다. 형식을 맞추는 일이라 무엇을 파는지는 알 필요가 없다.
 */
export interface BriefRefinementPromptContext {
  sceneBrief: string;
  constraints: string;
}

/**
 * 편집 화면용 프롬프트 뷰: 고정부(읽기 전용) + 편집부(현재값) + 기본값(리셋용)
 * 프론트가 header 와 footer 를 읽기 전용으로 보여주고 instructions 만 편집
 */
export interface PlanPromptView {
  header: string;
  footer: string;
  defaultInstructions: string;
  instructions: string;
  // 이 채널의 이미지 모델에 적용되는 안전 제약(고정, 읽기 전용). 해당 없으면 빈 문자열
  // "왜 이런 연출이 안 나오지"를 알 수 있게 편집 화면에 그대로 노출
  imageSafetyDirective: string;
}

/**
 * 이 채널이 커스텀 편집 지침을 쓰는가. 빈 값이거나 기본 지침과 같으면 false
 * 비교 대상을 인자로 받는 이유: 기본 지침이 버전마다 달라 한 버전 것을 고정하면 오판이 생김
 */
export function usesCustomPlanInstructions(
  instructions: string | undefined,
  defaultInstructions: string,
): boolean {
  const trimmed = (instructions ?? '').trim();
  return trimmed.length > 0 && trimmed !== defaultInstructions.trim();
}
