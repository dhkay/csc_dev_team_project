import type { ToolVersion } from '../../../../../../shared/domain/tool-version';
import type { OwnerVersionScope } from '../../../../../../shared/domain/workspace-scope';
import {
  BrandConceptAxis,
  ConceptChoice,
  ConceptSelection,
  CustomConceptAxis,
  CustomConceptOption,
} from '../../../domain';

/**
 * 한 사람의 브랜드/컨셉 한 세트(브랜드명, 설명, 축별 컨셉 방향)
 * brandName 이 세트 식별자라 한 사람 안에서 유일(저장된 기획안이 이 이름으로 세트를 찾음)
 */
export interface BrandConceptSet {
  brandName: string;
  brandDescription: string;
  // 축별 선택. 문구(label/note)는 읽을 때 카탈로그에서 채워짐
  concepts: ConceptSelection[];
  // 이 세트가 더한 카테고리와 레퍼런스. 기존 저장분에는 키가 없어 빈 배열
  customAxes: CustomConceptAxis[];
  customOptions: CustomConceptOption[];
}

/** 저장 요청의 한 세트. 컨셉은 고른 것만 담고 문구는 서버가 카탈로그에서 채움 */
export interface BrandConceptSetInput {
  brandName: string;
  brandDescription: string;
  concepts: ConceptChoice[];
  // 생략 가능(기존 호출부와 기존 저장분)
  customAxes?: CustomConceptAxis[];
  customOptions?: CustomConceptOption[];
}

/** 한 사람이 쓰는 AI 모델 선택. 값은 각 모델 서버의 식별자 */
export interface AiModelSelection {
  llm: string;
  video: string;
  // 자체 영상 모델의 t2v/i2v/ti2v. 빈 값이면 소스 이미지 유무로 자동 결정
  videoMode: string;
  tts: string;
  // tts 모델별로 해석되는 음성 id(예: 'ko-KR-SunHiNeural')
  ttsVoice: string;
  // edge-tts pitch(예: '+0Hz')
  ttsPitch: string;
  image: string;
}

/** 수집 상태. 빈 배열로 수집 중과 실패를 추측하지 않게 하려는 값 */
export type CollectionStatus = 'ok' | 'collecting' | 'failed';

/**
 * 소스별 수집 선택지(수집 서버 카탈로그 중계). 이 서버가 고를 수 있는 값의 전부
 * 목록 복제 시 어느 계층도 검증하지 않는 벤더 값이 생김
 */
export interface DataSourceOptions {
  sourceId: string;
  categories: { value: string; label: string }[];
  // expected 는 기간별 보관 수(진행률의 분모), 주인은 수집 서버
  periods: { value: string; label: string; expected: number }[];
}

/**
 * 수집에서 건진 키워드 후보 한 건
 * 수집 데이터는 기획 프롬프트에 들어가지 않고, 기획서는 사람이 고른 키워드만 받음
 */
export interface CollectedKeywordCandidate {
  keyword: string;
  // 화면 배지에 쓰는 출처
  sourceKey: string;
  sourceLabel: string;
  // 그 값을 주는 소스에서만. 고를 근거로 화면에 표시
  monthlySearches?: number;
}

/**
 * 설정 Inbound Port: 사람에 붙는 개인 설정, 채널에 붙는 기획 프롬프트 지침, 키워드 후보 수집
 * 분야 코드와 기간은 이 서버가 소유하지 않고 수집 서버 응답 안에서만 고름
 */
export interface ChannelSettingsPort {
  /** 브랜드/컨셉 선택지 목록(축과 옵션). 화면의 칩 렌더용 */
  getBrandConceptCatalog(): BrandConceptAxis[];
  /** 그 스코프 버전의 브랜드/컨셉 세트 목록(미설정이면 빈 배열). 채널 무관 */
  getBrandConceptSets(scope: OwnerVersionScope): Promise<BrandConceptSet[]>;
  /**
   * 그 버전의 세트 목록 교체 저장. 다른 버전 슬롯은 미변경
   * 커스텀 정의는 이 경로로 바뀌지 않음(이름을 바꾼 세트만 예외)
   */
  setBrandConceptSets(
    scope: OwnerVersionScope,
    sets: BrandConceptSetInput[],
  ): Promise<BrandConceptSet[]>;

  /**
   * 세트 하나의 연출 교체 저장(정의 + 그중 무엇을 골랐는지)
   * 브랜드명과 설명, 다른 세트는 미변경. 미저장 브랜드는 NotFound
   */
  setBrandConceptSetDetail(
    scope: OwnerVersionScope,
    brandName: string,
    detail: {
      customAxes: CustomConceptAxis[];
      customOptions: CustomConceptOption[];
      concepts: ConceptChoice[];
    },
  ): Promise<BrandConceptSet[]>;

  /** 그 스코프 버전의 AI 모델 선택. 미설정 필드는 빈 문자열 */
  getAiModels(scope: OwnerVersionScope): Promise<AiModelSelection>;
  /** 그 버전의 선택 교체 저장. 다른 버전 슬롯은 미변경 */
  setAiModels(
    scope: OwnerVersionScope,
    selection: AiModelSelection,
  ): Promise<AiModelSelection>;
  /** 도구 재진입 시 열릴 버전. 보고 있는 버전이 아니라 진입 리다이렉트의 힌트 */
  getEntryVersion(organizationId: number, ownerUserId: number): Promise<ToolVersion>;
  /** 진입 기본 버전 갱신. 모르는 값은 기본으로 좁힘 */
  setEntryVersion(
    organizationId: number,
    ownerUserId: number,
    version: string,
  ): Promise<ToolVersion>;
  /** 도구 진입 시 먼저 열릴 채널. 미지정이면 null 이고 호출부가 첫 채널로 접음 */
  getDefaultChannelId(organizationId: number, ownerUserId: number): Promise<number | null>;
  /** 진입 채널 지정(null = 해제) */
  setDefaultChannelId(
    organizationId: number,
    ownerUserId: number,
    channelId: number | null,
  ): Promise<number | null>;

  /**
   * 씨앗 주제로 키워드 후보 수집. 검색어를 직접 주는 소스만 참여
   * 각 소스는 best-effort 라 실패하거나 오래 걸리는 소스만 빠짐
   */
  collectKeywordCandidates(seed: string): Promise<CollectedKeywordCandidate[]>;

  /**
   * 채널에 저장된 기획서 편집 지침. 저장분만 반환하고 미설정이면 빈 문자열
   * 기본 지침은 기획서 생성 도메인 소유(여기서 채우면 의존 순환)
   */
  getPlanInstructionsOverride(channelId: number, version: ToolVersion): Promise<string>;
  /** 편집 지침 저장(트림과 길이컷). 빈 문자열은 저장 해제와 동일 */
  setPlanInstructionsOverride(
    scope: OwnerVersionScope,
    channelId: number,
    instructions: string,
  ): Promise<void>;
}

export const CHANNEL_SETTINGS_PORT = Symbol('CHANNEL_SETTINGS_PORT');
