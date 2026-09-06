// 기획서(마케팅 영상 기획안) 도메인 엔티티
// 하나의 기획안 = 아이디어(제목 + 요약) + 씬 목록

// 인포그래픽 형태는 saved-plan 도 똑같이 다뤄 앱 공유 커널이 소유하고 여기서는 재노출만 함
export type { InfographicType } from '../../../../../shared/domain/infographic';
import type { Infographic } from '../../../../../shared/domain/infographic';
import type { AudioAssetRef, SceneSfxRef } from '../../../../../shared/domain/audio';

/** 인포그래픽(type 판별 유니온). 해당 씬이 인포그래픽 씬일 때만이고 형태는 LLM 이 고름 */
export type PlanInfographicEntity = Infographic;

/**
 * 기획안 전체 배경음악. LLM 이 후보 목록의 태그를 보고 무드에 맞는 1개를 고름(기획안당 필수)
 * 선택 시점 스냅샷이라 uploadId 로 렌더와 재생하고 assetId 는 추적용
 */
export type PlanBgmEntity = AudioAssetRef;

/** 씬에 배치된 효과음. LLM 이 후보에서 골라 씬 시작 기준 offsetSec 을 정함 */
export type PlanSfxEntity = SceneSfxRef;

/**
 * 기획안의 한 씬. 버전마다 채우는 필드가 다름
 *
 * v1.0(이미지→영상)은 sourceDirection, imagePrompt, subtitle, 인포그래픽을 채우고
 * v1.5(텍스트→영상)는 sceneComposition 과 dialogue 를 채움. 두 버전 공통은 index 와 narration
 * 판별 유니온으로 가르지 않는 이유: 파서와 DTO, jsonb, 카드 UI 가 두 벌이 되는데
 * 물어야 하는 것은 "어느 쪽이 채워졌는가" 하나뿐. 채우지 않는 버전은 키 자체를 싣지 않음
 */
export interface PlanSceneEntity {
  // 씬 번호(1-base). v1.5 에서는 이것이 곧 동영상(세그먼트) 번호
  index: number;
  // 소스 방향(촬영과 연출 지시, 한국어). 이미지→영상 버전만 채움
  sourceDirection?: string;
  // 하단 자막(한국어). 이미지→영상 버전만 채움
  subtitle?: string;
  // 나레이션 음성(한국어)
  narration: string;
  // 씬 이미지 프롬프트. 이미지 모델에 그대로 나가는 시각 브리프이고 화면에는 미표시
  // 이미지 모델은 한 덩어리 텍스트만 받으므로 흩어진 의미를 한 컷 분량으로 접어넣은 완결된 글
  imagePrompt?: string;
  // 장면 구성: 영상 모델이 그대로 읽는 문장(텍스트→영상 버전만)
  // imagePrompt 는 정지 이미지용이라 움직임을 말하지 않아 재사용하면 모델이 남의 글을 받음
  sceneComposition?: string;
  // 대화내용: 화면 속 인물이 하는 말(텍스트→영상 버전만)
  // 화면 밖 문장은 narration 이고 한 동영상은 둘 중 하나만 가짐(둘 다 오면 파서가 대화내용을 남김)
  dialogue?: string;
  // 있으면 이 씬은 인포그래픽 씬
  infographic?: PlanInfographicEntity;
  // 이 씬 효과음 목록(0..N). 스튜디오 편집 대비 배열이고 없으면 생략
  sfx?: PlanSfxEntity[];
}

/** 기획안 1개: 아이디어(제목 + 한 줄 요약) + 씬 목록 + 전체 BGM */
export interface PlanProposalEntity {
  id: string;
  title: string;
  summary: string;
  scenes: PlanSceneEntity[];
  // 후보 풀이 비어 배정 못 하면 null 이고 렌더 경계에서 강제
  bgm: PlanBgmEntity | null;
}
