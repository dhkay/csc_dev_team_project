import { ChannelEntity, ChannelRosterEntry } from '../../../domain';

/**
 * 채널 Inbound Port: 사람마다 가지는 작업 맥락(블로그, 유튜브 등) CRUD
 *
 * CRUD 는 모두 ownerUserId 를 받고 남의 채널은 목록에도 id 로도 잡히지 않아 스코프가 곧 권한
 * listChannelRoster 만 조직 범위(원장의 남의 채널 id 를 이름으로 바꿀 통로가 없으면 전부 '삭제된 채널')
 * 다른 도메인은 채널 존재 확인에 getChannel 을 쓰고, 그 확인이 곧 "그 사람의 채널인가"가 됨
 */
export interface ChannelPort {
  /**
   * 그 사람의 채널 목록(표시 순서)
   * 채널이 하나도 없으면 기본 채널을 만들어 반환(빈 상태로 도구에 들어가지 않게)
   */
  listChannels(organizationId: number, ownerUserId: number): Promise<ChannelEntity[]>;
  /**
   * 조직 전체의 채널 이름 목록(주인 포함). 표시용 조인 전용
   * 없는 사람의 기본 채널을 만들지 않음(provisioning 은 그 사람이 도구에 들어올 때 할 일)
   */
  listChannelRoster(organizationId: number): Promise<ChannelRosterEntry[]>;
  /** 채널 단건. 없거나 남의 것이면 null. 다른 도메인의 소유 확인용 */
  getChannel(
    organizationId: number,
    ownerUserId: number,
    id: number,
  ): Promise<ChannelEntity | null>;
  /** 생성. 이름 중복은 Conflict(본인 채널 안에서만 판정) */
  createChannel(
    organizationId: number,
    ownerUserId: number,
    name: string,
  ): Promise<ChannelEntity>;
  /** 이름 편집. 부재는 NotFound, 이름 중복은 Conflict */
  updateChannel(
    organizationId: number,
    ownerUserId: number,
    id: number,
    name: string,
  ): Promise<ChannelEntity>;
  /**
   * 삭제(멱등). 채널에 매달린 설정은 FK cascade 이고 이미 없으면 false
   * 마지막 채널은 400(사람마다 채널이 최소 하나라는 불변식을 여기서 지킴)
   */
  deleteChannel(organizationId: number, ownerUserId: number, id: number): Promise<boolean>;
  /** 본인 목록의 표시 순서 재정렬. orderedIds 순서대로 sort_order 를 0..n-1 로 지정 */
  reorderChannels(
    organizationId: number,
    ownerUserId: number,
    orderedIds: number[],
  ): Promise<void>;
}

export const CHANNEL_PORT = Symbol('CHANNEL_PORT');
