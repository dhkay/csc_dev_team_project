import type {
  OrgVersionScope,
  OwnerVersionScope,
  WorkspaceScope,
} from '../../../../../../shared/domain/workspace-scope';
import { VideoFinalEntity } from '../../../domain';

/**
 * 최종 영상 Inbound Port: 개인 워크스페이스와 조직 공용 보관함
 * 워크스페이스 목록은 WorkspaceScope, 단건은 OwnerVersionScope, 보관함은 OrgVersionScope
 * 조회는 렌더 중 최종의 잡 상태를 재조정해 최신 상태를 반환
 */
export interface VideoFinalPort {
  /**
   * 완성 원천과 세트로 최종 영상 생성 + FINALIZE 렌더 잡 등록
   * 원천이 없거나 내 것이 아니면 null, 미완성이거나 세트 슬롯이 없으면 400
   */
  createFromSourcePersonal(
    scope: OwnerVersionScope,
    sourceId: number,
    setId: number,
    // 멱등키. 같은 값으로 다시 부르면 유료 잡 생성 전에 판정해 먼저 만든 행을 반환
    clientRequestId?: string | null,
  ): Promise<VideoFinalEntity | null>;
  /** 내 개인 워크스페이스 최종 목록. 채널과 버전으로 분리됨 */
  listPersonal(scope: WorkspaceScope): Promise<VideoFinalEntity[]>;
  getPersonal(scope: OwnerVersionScope, id: number): Promise<VideoFinalEntity | null>;
  /** 저장된 세트 스냅샷과 원천으로 새 FINALIZE 잡 등록(재렌더). 내 것이 아니면 null */
  rerenderPersonal(
    scope: OwnerVersionScope,
    id: number,
  ): Promise<VideoFinalEntity | null>;
  /** 내 워크스페이스 최종 영상 삭제. 보관물은 deleteArchived 담당 */
  deletePersonal(scope: OwnerVersionScope, id: number): Promise<boolean>;

  /** 보관함으로 보내기(이동). 내 것이 아니거나 이미 보관함이면 null */
  archivePersonal(
    scope: OwnerVersionScope,
    id: number,
  ): Promise<VideoFinalEntity | null>;
  /**
   * 보관함 목록. 조직 공용이라 작업자도 채널도 조건이 아님
   * 채널로 나누지 않는 이유: 채널이 개인 소유라 남의 채널 id 로는 아무도 걸러낼 수 없음
   * 보관 대상은 완성본뿐이라 렌더 재조정을 하지 않음
   */
  listArchive(scope: OrgVersionScope): Promise<VideoFinalEntity[]>;
  /**
   * 보관함에서 꺼내기. 누가 만든 것이든 꺼낸 사람의 워크스페이스로 들어옴
   * 스코프에 채널이 있는 이유는 그 워크스페이스를 정해야 해서고, 보관함에 없으면 null
   */
  unarchive(scope: WorkspaceScope, id: number): Promise<VideoFinalEntity | null>;
  /**
   * 보관함 항목 삭제. 만든 사람 또는 관리급(대표, 팀장)
   * 열람은 조직 전체지만 삭제는 되돌릴 수 없는 손실이라 전원에게 열지 않음
   * manageAll 을 빠뜨리면 소유자 경로로 동작하고, location='archive' 로 한정해 개인 항목을 보호
   */
  deleteArchived(scope: OwnerVersionScope, id: number, manageAll?: boolean): Promise<boolean>;
}

export const VIDEO_FINAL_PORT = Symbol('VIDEO_FINAL_PORT');
