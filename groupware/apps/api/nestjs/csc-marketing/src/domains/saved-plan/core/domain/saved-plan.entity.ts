// 저장된 기획안 도메인: 개인 워크스페이스와 보관함에 영구 보관되는 기획안 스냅샷

// 저장 위치 어휘는 공유 커널이 SSOT(최종 영상과 동일 축)
export type { WorkspaceLocation } from '../../../../shared/domain/workspace-location';

import type { WorkspaceLocation } from '../../../../shared/domain/workspace-location';
import type { ToolVersion } from '../../../../shared/domain/tool-version';
import type { Infographic } from '../../../../shared/domain/infographic';
import type { AudioAssetRef, SceneSfxRef } from '../../../../shared/domain/audio';
import type { ConceptChoice } from '../../../channel-settings/core/domain';

/**
 * 인포그래픽(정보 정리형 씬). 형태 정의는 앱 공유 커널이 소유해 어긋날 수 없음
 * 구조화 데이터를 그대로 영속(jsonb)해 후속 애니메이션 렌더가 같은 데이터를 재사용
 */
export type SavedPlanInfographic = Infographic;

/**
 * 기획안의 한 씬(텍스트). 이미지는 SavedPlanSceneImage 로 분리 참조
 * 버전마다 채우는 필드가 다름(v1.0 은 sourceDirection/subtitle/imagePrompt, v1.5 는 sceneComposition/dialogue)
 */
export interface SavedPlanScene {
  index: number;
  // 소스 방향(연출 지시). 이미지→영상 버전만 채움
  sourceDirection?: string;
  // 하단 자막. 이미지→영상 버전만 채움
  subtitle?: string;
  narration: string;
  // 씬 이미지 프롬프트(영어). 저장본에서 이미지를 다시 만들 때 사용
  imagePrompt?: string;
  // 장면 구성: 영상 모델이 그대로 읽는 문장(텍스트→영상 버전)
  sceneComposition?: string;
  // 대화내용: 화면 속 인물이 하는 말. 화면 밖에서 읽는 문장은 narration
  dialogue?: string;
  infographic?: SavedPlanInfographic;
  // 이 씬 효과음 목록(0..N). 생성 시 AI 가 고른 스냅샷 + 씬 시작 기준 offsetSec
  sfx?: SceneSfxRef[];
}

/**
 * 씬 이미지 참조. file-upload uploadId(영구 식별자)만 저장
 * 접근 URL 은 스토리지 백엔드에 종속되므로 조회 시 BFF 가 현재 공개 베이스로 재구성
 */
export interface SavedPlanSceneImage {
  index: number;
  uploadId: string;
  // 이 이미지를 만들 때 실제로 이미지 모델에 보낸 최종 프롬프트(생성 시점 값)
  prompt?: string;
}

/** 저장된 기획안 엔티티 */
export interface SavedPlanEntity {
  id: number;
  organizationId: number;
  ownerUserId: number;
  location: WorkspaceLocation;
  channelId: number | null;
  brandName: string;
  // 이 저장본을 만든 요청의 멱등키. 재시도가 같은 행을 집게 하는 값
  clientRequestId: string | null;
  // 이 기획안을 만들 때 실제로 쓴 연출 축 조합(생성 시점 스냅샷)
  // 작업자가 축을 그 자리에서 바꿔도 세트에 저장되지 않아 이 값이 없으면 재생성 시 연출이 어긋남
  // 빈 배열은 세트 조합 그대로이고, 문구는 카탈로그가 주인이라 읽을 때 채움
  brandConcepts: ConceptChoice[];
  title: string;
  summary: string;
  scenes: SavedPlanScene[];
  sceneImages: SavedPlanSceneImage[];
  // 기획안 전체 BGM. 후보 풀이 비어 미배정이면 null 이고 렌더에서 강제
  bgm: AudioAssetRef | null;
  // 이 기획안이 속한 도구 버전. NOT NULL 이라 버전 없는 기획안은 존재하지 않음
  version: ToolVersion;
  // 생성에 쓰인 모델 스냅샷(정보 표시용). 카탈로그 key 이고 없으면 빈 문자열
  llmModel: string;
  imageModel: string;
  // 이 기획안을 만들 때 고른 영상 모델. 정보 표시가 아니라 나중에 실제로 쓰이는 결정
  // 생성 모달의 선택은 설정에 남지 않아 저장하지 않으면 그때의 설정으로 렌더됨
  // 빈 문자열은 미선택이라 설정을 봄
  videoModel: string;
  // 세그먼트 연결 방식(생성 시점 스냅샷). 빈 문자열이면 렌더 기본
  segmentMode: string;
  createdAt: Date;
  updatedAt: Date;
}
