import { RenderStatus, VideoFinalEntity } from '../../../domain';
import type { FinalOverlays } from '../../../../../../shared/domain/overlay';
import type {
  OrgVersionScope,
  OwnerVersionScope,
  WorkspaceScope,
} from '../../../../../../shared/domain/workspace-scope';

/**
 * 최종 영상 레코드 생성 입력: 원천 참조 + 세트 슬롯 스냅샷 + 오버레이 스펙 + 최초 렌더 상태
 * 조직, 작업자, 버전은 스코프 소유라 여기 없음(요청과 다른 버전으로 행을 만들 수 없게)
 */
export interface CreateVideoFinalRecord {
  // 원천 채널 스냅샷. 서비스가 원천에서 읽어 채움
  channelId: number | null;
  parentSourceId: number | null;
  frameUploadId: string | null;
  outroUploadId: string | null;
  title: string;
  aspectRatio: string;
  overlays: FinalOverlays | null;
  // 멱등키. 같은 클릭의 재시도가 잡을 두 번 만들지 않게 함
  clientRequestId: string | null;
  renderJobId: string | null;
  renderStatus: RenderStatus;
}

/** 최종 영상 레포지토리 아웃바운드 포트: marketingdb marketing_video_finals */
export interface VideoFinalRepositoryPort {
  /**
   * 스코프의 버전으로 행을 굳힌다(요청 버전 = 산출물 버전)
   * 멱등: clientRequestId 가 같으면 이미 만든 행을 반환해 사가 예약 단계의 재실행이 안전해짐
   */
  createRecord(
    scope: OwnerVersionScope,
    record: CreateVideoFinalRecord,
  ): Promise<VideoFinalEntity>;
  /**
   * 개인 워크스페이스 최종 영상 조회. 스코프(조직, 작업자, 채널, 버전) + location='personal'
   * 위치 조건이 곧 "보관함으로 보내면 워크스페이스에서 사라진다"는 이동 의미
   */
  findRecordsByOwner(scope: WorkspaceScope): Promise<VideoFinalEntity[]>;
  /**
   * 보관함 조회. 스코프는 (조직, 버전) + location='archive' 이고 작업자도 채널도 조건이 아님
   * 개인 축을 담은 타입을 받으면 조건이 슬며시 붙어 목록이 좁아지므로 OrgVersionScope
   * 채널로 나누지 않는 이유: 채널이 개인 소유라 남의 채널 id 로는 아무도 걸러낼 수 없음
   */
  findRecordsByLocation(scope: OrgVersionScope): Promise<VideoFinalEntity[]>;
  /**
   * 내 최종 영상 단건. 스코프가 소유 검증을 함께 함
   * location 은 걸지 않음(소유는 보안 경계, 위치는 제품 규칙이라 필요한 호출부에 둠)
   */
  findOneOwned(scope: OwnerVersionScope, id: number): Promise<VideoFinalEntity | null>;
  /**
   * 보관함 단건(소유 무관). 스코프는 (조직, 버전) + location='archive'
   * 위치를 조건에 넣는 이유: 개인 항목까지 집으면 정리 권한으로 남의 작업 중 항목을 삭제 가능
   */
  findOneArchived(scope: OrgVersionScope, id: number): Promise<VideoFinalEntity | null>;
  /**
   * 보관함으로 보내기. location='personal' 일 때만 'archive' 로 전이
   * 조건부 갱신이라 반환값이 곧 전이 기록의 증표(중복 클릭에도 활동 로그가 두 번 남지 않음)
   */
  archiveRecord(organizationId: number, id: number): Promise<VideoFinalEntity | null>;
  /**
   * 보관함에서 꺼낸 사람의 워크스페이스로 이동. location='personal' + 소유자와 채널을 스코프 값으로
   * 원 소유자를 두면 그 항목이 꺼낸 사람 눈에 보이지 않아 "꺼냈는데 사라졌다"가 됨
   * 전이 조건은 보관함의 열람 범위(조직, 버전, location='archive')
   */
  moveArchivedToWorkspaceRecord(
    scope: WorkspaceScope,
    id: number,
  ): Promise<VideoFinalEntity | null>;
  /**
   * 렌더 상태 재조정(잡 폴링 결과 반영). jobId 는 유지
   * 비종료 상태에서만 갱신하므로 반환값이 곧 전이 기록의 증표(동시 폴링에도 완료 로그 1건)
   */
  updateRenderStateRecord(
    organizationId: number,
    id: number,
    renderStatus: RenderStatus,
    resultUploadId: string | null,
    error: string | null,
  ): Promise<VideoFinalEntity | null>;
  /**
   * 이 행에 렌더 잡을 붙여 시작(잡 id + RENDERING, 이전 결과와 에러 초기화)
   * 최초 생성과 재렌더가 함께 쓴다. 유니크 제약이 유료 잡 생성 전에 중복을 걸러야 해 이 순서
   */
  startRenderRecord(
    organizationId: number,
    id: number,
    renderJobId: string,
  ): Promise<VideoFinalEntity | null>;
  deleteRecordById(organizationId: number, id: number): Promise<boolean>;
}

export const VIDEO_FINAL_REPOSITORY_PORT = Symbol('VIDEO_FINAL_REPOSITORY_PORT');
