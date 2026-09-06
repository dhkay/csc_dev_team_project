import { ChannelEntity, ChannelRosterEntry } from '../../../domain';

/**
 * 채널 레포지토리 아웃바운드 포트 (marketingdb: 채널 행)
 *
 * CRUD 는 전부 (organizationId, ownerUserId) 로 스코프된다: 채널은 개인 소유라 남의 채널은
 * 조회도 수정도 되지 않는다. 조직 id 를 함께 거는 이유는 유저 id 가 userdb 소유라 이 DB 안에서
 * 검증할 수 없기 때문이다(다른 조직의 유저 id 를 들고 와도 행이 잡히지 않는다)
 *
 * 예외가 하나 있다: `findChannelRoster` 는 조직 범위로 이름만 읽는다. 근거는 엔티티 주석 참고
 */
export interface ChannelRepositoryPort {
  /** 그 사람의 채널 목록(표시 순서) */
  findManyChannelRecords(
    organizationId: number,
    ownerUserId: number,
  ): Promise<ChannelEntity[]>;
  /**
   * 조직 전체의 채널 이름 목록(주인 포함). 표시용 조인 전용이라 CRUD 스코프 밖이다.
   * `Record` 접미사를 붙이지 않는 이유: 엔티티 행 CRUD 가 아니라 이름 투영이다.
   */
  findChannelRoster(organizationId: number): Promise<ChannelRosterEntry[]>;
  /** 그 사람에게 채널이 하나도 없을 때만 기본 채널을 만든다(멱등, 권한 불필요 provisioning) */
  ensureDefaultChannelExistsRecord(
    organizationId: number,
    ownerUserId: number,
  ): Promise<void>;
  findOneChannelRecordById(
    organizationId: number,
    ownerUserId: number,
    id: number,
  ): Promise<ChannelEntity | null>;
  findOneChannelRecordByName(
    organizationId: number,
    ownerUserId: number,
    name: string,
  ): Promise<ChannelEntity | null>;
  /** 그 사람의 채널 개수: 마지막 채널 삭제를 막는 판단에 쓴다. */
  countChannelRecords(organizationId: number, ownerUserId: number): Promise<number>;
  /** 생성: 이름 중복은 서비스가 선행 검증(경합은 (org,owner,name) 유니크로 안전) */
  createChannelRecord(
    organizationId: number,
    ownerUserId: number,
    name: string,
  ): Promise<ChannelEntity>;
  /** 이름 갱신. 중복 검증은 서비스가 선행 */
  updateChannelRecord(
    organizationId: number,
    ownerUserId: number,
    id: number,
    name: string,
  ): Promise<ChannelEntity>;
  /** 삭제(멱등): 매달린 설정은 FK cascade. 이미 없으면(남의 것이어도) false. */
  deleteChannelRecord(
    organizationId: number,
    ownerUserId: number,
    id: number,
  ): Promise<boolean>;
  /** orderedIds 순서대로 sort_order 를 0..n-1 로 갱신(본인 채널만, 한 트랜잭션) */
  reorderChannelRecords(
    organizationId: number,
    ownerUserId: number,
    orderedIds: number[],
  ): Promise<void>;
}

export const CHANNEL_REPOSITORY_PORT = Symbol('CHANNEL_REPOSITORY_PORT');