/**
 * 최종 영상 도메인: 원천 영상에 세트(배경프레임 + 아웃트로)를 입힌 배포용 파생본
 * 합성 결과물은 video-model 소유고 메타와 상태는 marketingdb. 원천 1:N 최종
 * frame 과 outro 는 적용 시점 스냅샷이라 세트 변경과 무관
 */

import type { RenderStatus } from '../../../../shared/domain/render-status';
import type { ToolVersion } from '../../../../shared/domain/tool-version';
import type { FinalOverlays } from '../../../../shared/domain/overlay';
import type { WorkspaceLocation } from '../../../../shared/domain/workspace-location';

// 렌더 상태 어휘는 공유 커널이 SSOT(video-project 와 동일). STALLED 포함
export type { RenderStatus } from '../../../../shared/domain/render-status';
export { NON_TERMINAL_RENDER_STATUSES } from '../../../../shared/domain/render-status';
// 저장 위치 어휘도 공유 커널이 SSOT(기획안과 동일 축)
export type { WorkspaceLocation } from '../../../../shared/domain/workspace-location';

/** 최종 영상 엔티티 */
export interface VideoFinalEntity {
  id: number;
  organizationId: number;
  // 소유 작업자: 보관함으로 옮겨도 유지된다(누가 올렸는지 + 꺼내기 시 돌아갈 워크스페이스)
  ownerUserId: number;
  // personal=개인 워크스페이스 / archive=보관함(조직 공유, 채널별 분리)
  location: WorkspaceLocation;
  // 원천 채널(스냅샷): 개인 워크스페이스는 채널별로 분리된다. 원천 삭제와 무관하게 보존
  channelId: number | null;
  // 원천 영상 프로젝트 id. 원천 삭제 시 null(스냅샷은 유지)
  parentSourceId: number | null;
  // 적용 세트 배경프레임(file-upload uploadId) 스냅샷. 없으면 null.
  frameUploadId: string | null;
  // 적용 세트 아웃트로(file-upload uploadId) 스냅샷. 없으면 null.
  outroUploadId: string | null;
  title: string;
  aspectRatio: string;
  // 이 최종 영상이 속한 도구 버전. 워크스페이스 탭과 보관함이 모두 이 값으로 갈린다.
  // 만든 요청이 말한 값을 굳힌 것이고, NOT NULL 이라 버전 없는 최종 영상은 존재하지 않는다.
  version: ToolVersion;
  // 이 행을 만든 요청의 멱등키(없으면 null). 재시도가 잡을 두 번 만들지 않게 하는 값
  clientRequestId: string | null;
  renderJobId: string | null;
  renderStatus: RenderStatus;
  // 제목(상단)/자막(하단) 오버레이 스펙: 스튜디오 편집 대상. 생성 시 기본값 seed, 재렌더가 이 값을 쓴다.
  overlays: FinalOverlays | null;
  // 렌더 진행률(0~100): 렌더 중일 때만(비영속: 조회 시 잡 상태에서 실어준다, DB 저장 안 함)
  progress: number | null;
  // 완성 최종 영상의 file-upload uploadId(접근 URL 은 조회 시 BFF 가 재구성)
  resultUploadId: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}
