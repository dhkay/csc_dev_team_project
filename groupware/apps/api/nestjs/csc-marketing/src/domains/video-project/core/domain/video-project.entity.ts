// 영상 프로젝트 도메인: 저장 기획안을 스냅샷해 만든 편집 가능한 영상 조합 스펙 + 렌더 상태
// 렌더 결과물은 video-model 소유(file-upload uploadId 참조), 편집 데이터는 marketingdb

import type { AudioAssetRef, SceneSfxRef } from '../../../../shared/domain/audio';
import type { ToolVersion } from '../../../../shared/domain/tool-version';
import type { RenderStatus } from '../../../../shared/domain/render-status';

// 렌더 상태 어휘는 공유 커널이 SSOT(video-final 과 동일)
export type { RenderStatus } from '../../../../shared/domain/render-status';
export { NON_TERMINAL_RENDER_STATUSES } from '../../../../shared/domain/render-status';

/**
 * 씬 자막: 화면에 얹는 텍스트. style 은 미래 편집(폰트, 위치, 색) 자리로 지금은 기본값 렌더
 * 렌더러가 이 스펙을 해석하므로 편집 UI 가 붙어도 필드만 채우면 됨
 */
export interface VideoProjectSubtitle {
  text: string;
  style?: { font?: string; size?: number; position?: string; color?: string };
}

/** 영상 프로젝트 한 씬(조합 스펙). 저장 기획안 씬에서 파생 */
export interface VideoProjectScene {
  order: number;
  // 씬 비주얼 소스(file-upload uploadId)
  imageUploadId: string;
  narration: string;
  subtitle: VideoProjectSubtitle;
  // 텍스트→영상 provider 에 보낼 화면 묘사. 기획안의 장면 구성에서 옴
  // 이미지→영상은 씬 이미지가 화면을 정해 불필요. 없으면 어댑터가 기본 모션 프롬프트로 폴백
  visualPrompt?: string;
  // 화면 속 인물이 하는 말(기획안 대화내용 스냅샷). 화면 밖에서 읽는 문장은 narration
  // 소리를 합성하는 렌더는 두 문장을 이어 TTS 로 만들고, 아니면 영상 프롬프트에 실어 모델이 냄
  dialogue?: string;
  // 사람이 지정한 길이(초). 미지정이면 대화내용이 정함(나레이션 켬은 TTS 측정, 끔은 텍스트 추정)
  // 추정치를 이 자리에 넣지 않음. 넣으면 사용자 지정과 우리 어림을 구분할 수 없어 우선 규칙이 무의미
  durationSec?: number;
  // 다음 씬으로의 전환(예: crossfade). 미래 편집 자리
  transition?: string;
  // 이 씬 효과음 목록(0..N). 스냅샷 + 씬 시작 기준 offsetSec
  sfx?: SceneSfxRef[];
}

/**
 * 만들어진 세그먼트 하나(= 씬 하나의 렌더 결과). 영속
 * reconcile 이 비종료 행만 물어보므로 저장하지 않으면 완성 영상의 세그먼트 격자가 사라짐
 */
export interface VideoProjectSegment {
  order: number;
  // 'waiting' | 'running' | 'done'. 값 공간은 렌더가 소유
  status: string;
  // 이 세그먼트 클립의 file-upload uploadId. 접근 URL 은 조회 시 BFF 가 재구성
  clipUploadId: string | null;
  durationSec: number | null;
  // 이 세그먼트를 만든 화면 묘사. 다시 만들기 전에 고칠 대상이라 함께 보관
  prompt: string | null;
}

/** 영상 프로젝트 배경 프레임(미래). 형태가 정해지면 채운다. */
export interface VideoProjectBackground {
  type?: string;
  [k: string]: unknown;
}

/** 영상 프로젝트 엔티티 */
export interface VideoProjectEntity {
  id: number;
  organizationId: number;
  ownerUserId: number;
  channelId: number | null;
  savedPlanId: number | null;
  title: string;
  aspectRatio: string;
  // 원천 영상 화질(예: '720p'). 재렌더가 같은 화질로 재현하도록 저장
  resolution: string;
  // 생성 시점 AI 모델 선택 스냅샷. 빈 값이면 기본
  videoModel: string;
  videoMode: string;
  // 세그먼트(씬) 연결 방식(생성 시점 스냅샷). 기획안에서 옴
  // 벤더로 나가는 스펙이 이 행에서 조립되므로 행에 있어야 렌더에 도달. 빈 문자열이면 렌더 기본
  segmentMode: string;
  ttsModel: string;
  ttsVoice: string;
  ttsPitch: string;
  scenes: VideoProjectScene[];
  background: VideoProjectBackground | null;
  // 기획안 전체 BGM(필수). 저장 기획안 스냅샷이고 null 이면 렌더 등록이 막힘
  bgm: AudioAssetRef | null;
  // 이 행을 만든 요청의 멱등키. 재시도가 잡을 두 번 만들지 않게 하는 값
  clientRequestId: string | null;
  renderJobId: string | null;
  // 이 원천 영상이 속한 도구 버전. NOT NULL 이라 버전 없는 원천 영상은 존재하지 않음
  version: ToolVersion;
  renderStatus: RenderStatus;
  // 렌더 진행률(0~100). 렌더 중일 때만 채워지고 비영속
  progress: number | null;
  // 렌더 구간('SCENES'|'FINALIZING'). progress 와 같은 규칙으로 비영속
  renderStage: string | null;
  // 만들어진 세그먼트 목록(영속). 다중 씬 조합 렌더만 채워짐
  // 종료 전이에서만 저장(중간 틱마다 쓰면 쓰기 증폭). 조회는 살아 있는 값을 우선
  segments: VideoProjectSegment[] | null;
  // 완성 영상의 file-upload uploadId. 접근 URL 은 조회 시 BFF 가 재구성
  resultUploadId: string | null;
  // 시간동기 자막 트랙(JSON) file-upload id. COMPOSE 완료 시 채워지고 최종이 fetch 해 번인
  captionsUploadId: string | null;
  // 대표 썸네일(file-upload uploadId). 사람이 결과 화면에서 만들어 붙인 그림
  // 렌더가 채우는 값이 아님. 카드 그림은 이 값이 없으면 첫 씬 이미지를 사용
  thumbnailUploadId: string | null;
  // 작업 공간에 배치된 시각. 만들어진 것과 사람이 자기 것으로 확정한 것을 가름
  // 확정 단계가 있는 버전은 목록이 이 값으로 걸러지고, 없는 버전은 이 값을 보지 않음
  placedAt: Date | null;
  // 지금 어디 있는가: 'personal'(개인 작업 공간) | 'archive'(보관함)
  // placedAt 은 확정 여부, 이것은 위치라 보관물은 둘 다 가짐
  location: string;
  error: string | null;
  // 실패 사유 코드(렌더 소유 어휘, 통과만). 화면이 한도와 크레딧 같은 사유를 가르는 값
  // error 와 같은 전이에서 함께 갱신되고, 종료 뒤에도 남아 활동 로그와 알림의 근거가 됨
  errorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}
