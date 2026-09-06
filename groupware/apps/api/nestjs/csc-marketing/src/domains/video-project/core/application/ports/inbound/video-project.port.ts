import type {
  OrgVersionScope,
  OwnerVersionScope,
  WorkspaceScope,
} from '../../../../../../shared/domain/workspace-scope';
import { VideoProjectEntity } from '../../../domain';

/**
 * 영상 프로젝트 Inbound Port: 개인 워크스페이스(작업자 x 채널 x 버전)의 생성, 목록, 재렌더, 삭제
 *
 * 스코프가 객체인 이유: 버전이 빠진 호출을 컴파일 차단. 목록은 WorkspaceScope, 단건은 OwnerVersionScope
 * 조회는 렌더 중 프로젝트의 video-model 잡 상태를 재조정해 최신 상태를 반환
 */
export interface VideoProjectPort {
  /**
   * 저장 기획안(개인)을 스냅샷해 프로젝트 생성 + 렌더 잡 등록. 내 저장본이 아니면 null
   * 씬 텍스트와 씬 이미지, 채널 AI 모델 선택으로 조합 스펙을 만든다.
   */
  createFromSavedPlanPersonal(
    scope: OwnerVersionScope,
    savedPlanId: number,
    // 요청 화질. 모델이 지원하지 않으면 서비스가 기본값으로 떨어뜨림
    resolution?: string | null,
    // 멱등키. 같은 값으로 다시 부르면 유료 잡 생성 전에 판정해 먼저 만든 행을 반환
    clientRequestId?: string | null,
  ): Promise<VideoProjectEntity | null>;
  /**
   * 렌더를 거치지 않고 완성 + 배치된 산출물 생성(진행 화면 미리보기의 마지막 단계)
   *
   * 미리보기는 유료 렌더를 돌리지 않아 그 시점까지 서버에 행이 없어 버튼 동작을 확인할 수 없었음
   * 만들어진 행은 렌더 잡만 없고 나머지는 같아 목록, 보관, 삭제가 실제와 동일. 개발 환경 전용
   */
  createPreviewPersonal(
    scope: OwnerVersionScope,
    input: {
      channelId: number;
      title: string;
      videoModel: string;
      // 완성 영상 uploadId(브라우저가 presign + PUT 까지 마친 자산). UPLOADED 확정은 이쪽 담당
      resultUploadId: string;
      thumbnailUploadId?: string | null;
      clientRequestId?: string | null;
    },
  ): Promise<VideoProjectEntity>;
  /** 내 개인 워크스페이스 원천 영상 목록. 채널과 버전으로 분리 */
  listPersonal(scope: WorkspaceScope): Promise<VideoProjectEntity[]>;
  getPersonal(scope: OwnerVersionScope, id: number): Promise<VideoProjectEntity | null>;
  /**
   * 작업 공간에 배치(생성 창의 마지막 단계). 내 것이 아니면 null, 미완성이면 400
   * 함께 온 대표 썸네일의 UPLOADED 확정도 여기서 하고, 실패 시 그림만 되돌리고 던짐
   */
  placeInWorkspacePersonal(
    scope: OwnerVersionScope,
    id: number,
    thumbnailUploadId?: string | null,
  ): Promise<VideoProjectEntity | null>;
  /** 저장된 조합 스펙으로 새 렌더 잡 등록(재렌더). 내 것이 아니면 null */
  rerenderPersonal(
    scope: OwnerVersionScope,
    id: number,
  ): Promise<VideoProjectEntity | null>;
  /**
   * 세그먼트 하나만 다시 만든다. 나머지는 이미 만든 결과를 사용하고 내 것이 아니면 null
   * visualPrompt 를 주면 화면 묘사를 바꿔 재생성하며 벤더 비용은 그 하나에만 발생
   */
  rerenderSegmentPersonal(
    scope: OwnerVersionScope,
    id: number,
    order: number,
    visualPrompt?: string | null,
  ): Promise<VideoProjectEntity | null>;
  deletePersonal(scope: OwnerVersionScope, id: number): Promise<boolean>;
  /**
   * 보관함 목록. 조직 공용이라 작업자도 채널도 조건이 아님
   * 원천과 최종을 가르지 않는 버전에서는 이 표의 완성본이 곧 그 버전의 배포본
   */
  listArchive(scope: OrgVersionScope): Promise<VideoProjectEntity[]>;
  /**
   * 내 작업 공간 영상을 조직 보관함으로 이동(복사 아님). 내 것이 아니면 null, 미완성이면 400
   * 배치를 거치지 않은 영상은 목록에 없지만 화면이 아니라 계약이 경계여야 하므로 서비스가 확인
   */
  archivePersonal(scope: OwnerVersionScope, id: number): Promise<VideoProjectEntity | null>;
  /** 보관함에서 꺼내기. 누가 만든 것이든 꺼낸 사람의 작업 공간으로 들어오고 없으면 null */
  unarchive(scope: WorkspaceScope, id: number): Promise<VideoProjectEntity | null>;
  /**
   * 보관물 삭제. 만든 사람 또는 관리급(대표, 팀장)이 지우고 되돌릴 수 없음
   * deletePersonal 과 갈라 둔 이유는 권한 규칙이 다르기 때문
   */
  deleteArchived(
    scope: OwnerVersionScope,
    id: number,
    manageAll?: boolean,
  ): Promise<boolean>;
}

export const VIDEO_PROJECT_PORT = Symbol('VIDEO_PROJECT_PORT');
