import {
  RenderStatus,
  VideoProjectBackground,
  VideoProjectEntity,
  VideoProjectScene,
  VideoProjectSegment,
} from '../../../domain';
import type { AudioAssetRef } from '../../../../../../shared/domain/audio';
import type {
  OrgVersionScope,
  OwnerVersionScope,
  WorkspaceScope,
} from '../../../../../../shared/domain/workspace-scope';

/**
 * 영상 프로젝트 레코드 생성 입력: 모델 스냅샷 + 조합 스펙 + 최초 렌더 상태
 * 조직, 작업자, 버전은 스코프 소유라 여기 없음(요청과 다른 버전으로 행을 만들 수 없게)
 */
export interface CreateVideoProjectRecord {
  channelId: number | null;
  savedPlanId: number | null;
  title: string;
  aspectRatio: string;
  resolution: string;
  videoModel: string;
  videoMode: string;
  // 세그먼트 연결 방식(빈 문자열이면 미선택이라 렌더 기본)
  segmentMode: string;
  ttsModel: string;
  ttsVoice: string;
  ttsPitch: string;
  scenes: VideoProjectScene[];
  background: VideoProjectBackground | null;
  // 기획안 전체 BGM(필수). 저장 기획안 스냅샷이고 렌더 등록 전 서비스가 null 을 차단
  bgm: AudioAssetRef | null;
  // 멱등키. 같은 클릭의 재시도가 잡을 두 번 만들지 않게 함
  clientRequestId: string | null;
  renderJobId: string | null;
  renderStatus: RenderStatus;
}

/**
 * 렌더 없이 이미 완성된 채로 만드는 행의 입력(진행 화면 미리보기)
 * CreateVideoProjectRecord 와 갈라 둔 이유: 한 타입이면 모든 필드가 선택이 되어 유효 조합을 타입이 못 말함
 */
export interface CreatePlacedVideoProjectRecord {
  channelId: number | null;
  title: string;
  aspectRatio: string;
  resolution: string;
  videoModel: string;
  // 완성 영상(file-upload uploadId). 이 경로는 결과물 없이 행을 만들지 않음
  resultUploadId: string;
  thumbnailUploadId: string | null;
  // 멱등키. 같은 클릭의 재시도가 행을 두 개 만들지 않게 함
  clientRequestId: string | null;
}

/**
 * 렌더 상태 갱신 입력: 잡 폴링 스냅샷을 행에 반영할 값
 * 객체 하나로 받는 이유: 값이 여섯이라 위치 인자면 순서 실수가 컴파일을 통과하고, 필드가 늘 때마다
 * 호출부와 spec 의 호출 검증을 전부 고쳐야 했다(errorCode 추가 때 그랬다)
 */
export interface RenderStateUpdate {
  renderStatus: RenderStatus;
  resultUploadId: string | null;
  captionsUploadId: string | null;
  // 실패 문장과 사유 코드는 한 쌍. 성공은 둘 다 null 로 덮음
  error: string | null;
  errorCode: string | null;
  // 만들어진 세그먼트 목록. 없거나 null 이면 이전 값 유지. 종료 전이에서만 넘겨 쓰기 증폭 방지
  segments?: VideoProjectSegment[] | null;
}

/** 영상 프로젝트 레포지토리 아웃바운드 포트: marketingdb marketing_video_projects */
export interface VideoProjectRepositoryPort {
  /**
   * 스코프의 버전으로 행을 굳힌다(요청 버전 = 산출물 버전)
   * 멱등: clientRequestId 가 같으면 이미 만든 행을 반환해 사가 예약 단계의 재실행이 안전해짐
   */
  createRecord(
    scope: OwnerVersionScope,
    record: CreateVideoProjectRecord,
  ): Promise<VideoProjectEntity>;
  /**
   * 렌더를 거치지 않고 완성 + 배치된 행 생성(진행 화면 미리보기의 산출물)
   * createRecord 와 같은 표에 같은 모양이라 이후 동작(보관, 삭제, 목록)이 실제 산출물과 동일. 멱등
   */
  createPlacedRecord(
    scope: OwnerVersionScope,
    record: CreatePlacedVideoProjectRecord,
  ): Promise<VideoProjectEntity>;
  /**
   * 개인 워크스페이스 목록. 스코프는 (조직, 작업자, 채널, 버전) + location='personal'
   * 위치 조건이 곧 "보관함으로 보내면 작업 공간에서 사라진다"는 이동 의미(빠지면 복사가 됨)
   */
  findRecordsByOwner(scope: WorkspaceScope): Promise<VideoProjectEntity[]>;
  /**
   * 보관함 조회. 스코프는 (조직, 버전) + location='archive' 이고 작업자도 채널도 조건이 아님
   * 개인 축을 담은 타입을 받으면 조건이 슬며시 붙어 목록이 좁아지므로 OrgVersionScope
   */
  findRecordsByLocation(scope: OrgVersionScope): Promise<VideoProjectEntity[]>;
  /**
   * 내 원천 영상 단건. 스코프가 소유 검증을 함께 하고 다른 버전이나 남의 id 는 null
   * location 은 걸지 않음(소유는 보안 경계, 위치는 제품 규칙이라 필요한 호출부에 둠)
   */
  findOneOwned(scope: OwnerVersionScope, id: number): Promise<VideoProjectEntity | null>;
  /**
   * 보관함 단건(소유 무관). 스코프는 (조직, 버전) + location='archive'
   * 위치를 조건에 넣는 이유: 개인 작업 공간 항목까지 집으면 정리 권한으로 남의 작업 중 항목을 삭제 가능
   */
  findOneArchived(scope: OrgVersionScope, id: number): Promise<VideoProjectEntity | null>;
  /**
   * 보관함으로 보내기. location='personal' 일 때만 'archive' 로 전이
   * 조건부 갱신이라 반환값이 곧 전이 기록의 증표(중복 클릭에도 활동 로그가 두 번 남지 않음)
   */
  archiveRecord(organizationId: number, id: number): Promise<VideoProjectEntity | null>;
  /**
   * 보관함에서 꺼낸 사람의 작업 공간으로 이동. location='personal' + 소유자와 채널을 스코프 값으로
   * 소유자와 채널을 함께 바꾸는 이유: 원 소유자를 두면 그 항목이 꺼낸 사람 눈에 보이지 않음
   * 배치 시각은 미변경(꺼내기는 위치를 되돌리는 일이지 확정을 다시 하는 일이 아님)
   */
  moveArchivedToWorkspaceRecord(
    scope: WorkspaceScope,
    id: number,
  ): Promise<VideoProjectEntity | null>;
  /**
   * 렌더 상태 재조정(잡 폴링 결과 반영). jobId 는 유지
   * 비종료 상태에서만 갱신하므로 반환값이 곧 전이 기록의 증표(늦은 폴러의 종료 상태 되돌림 차단)
   */
  updateRenderStateRecord(
    organizationId: number,
    id: number,
    update: RenderStateUpdate,
  ): Promise<VideoProjectEntity | null>;
  /**
   * 이 행에 렌더 잡을 붙여 시작(잡 id + RENDERING, 이전 결과와 에러 초기화)
   * 최초 생성과 재렌더가 함께 쓴다. 유니크 제약이 유료 잡 생성 전에 중복을 걸러야 해 이 순서
   */
  startRenderRecord(
    organizationId: number,
    id: number,
    renderJobId: string,
  ): Promise<VideoProjectEntity | null>;
  /**
   * 작업 공간에 배치. 배치 시각을 찍고 함께 온 대표 썸네일이 있으면 교체
   * 배치 시각은 처음 한 번만(썸네일을 고쳐 다시 눌러도 앞으로 밀리지 않음). 렌더 상태는 미변경
   */
  placeInWorkspaceRecord(
    organizationId: number,
    id: number,
    thumbnailUploadId: string | null,
  ): Promise<VideoProjectEntity | null>;
  /**
   * 대표 썸네일만 교체. 없는 행이면 null
   * 소비자는 배치의 되돌리기 하나(배치 자체는 되돌리지 않고 그림만 이전 값으로 복원)
   */
  updateThumbnailRecord(
    organizationId: number,
    id: number,
    thumbnailUploadId: string | null,
  ): Promise<VideoProjectEntity | null>;
  deleteRecordById(organizationId: number, id: number): Promise<boolean>;
}

export const VIDEO_PROJECT_REPOSITORY_PORT = Symbol('VIDEO_PROJECT_REPOSITORY_PORT');
