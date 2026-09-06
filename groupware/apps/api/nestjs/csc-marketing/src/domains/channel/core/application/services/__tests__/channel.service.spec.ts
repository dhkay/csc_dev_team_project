import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ChannelService } from '../channel.service';
import {
  ChannelRepositoryPort,
  CHANNEL_REPOSITORY_PORT,
} from '../../ports/outbound';
import { ChannelEntity } from '../../../domain';

/**
 * 채널 레포지토리 인메모리 페이크
 *
 * 실제 테이블처럼 (조직, 소유자) 로 스코프한다: 채널이 개인 소유라는 것이 이 저장소의 핵심 계약이고,
 * 페이크가 그 축을 흉내내지 않으면 "남의 채널이 보인다" 류 회귀가 여기서 잡히지 않는다.
 *
 * 실물 어댑터는 채널 삭제 뒤 값 테이블의 고아를 정리한다. 그건 서비스가 아니라 어댑터의
 * 계약이라, 여기서는 키워드를 문자열 집합으로만 모사해 "채널을 지우면 그 채널에만 있던 값도
 * 사라진다"는 불변식을 확인한다.
 */
class FakeChannelRepository implements ChannelRepositoryPort {
  private seq = 0;
  private channels = new Map<
    number,
    { org: number; owner: number; name: string; sortOrder: number }
  >();
  /** 채널별 키워드 값(어댑터의 파트/링크 조인을 대신하는 최소 모사) */
  private keywords = new Map<number, Set<string>>();

  /** 테스트 준비용: 이 채널에 키워드 값이 있다고 둔다. */
  seedKeyword(channelId: number, value: string): void {
    const set = this.keywords.get(channelId) ?? new Set<string>();
    set.add(value);
    this.keywords.set(channelId, set);
  }

  /** 그 사람의 채널 어딘가에 이 값이 남아 있는가(고아 GC 검증용) */
  hasKeywordValue(org: number, owner: number, value: string): boolean {
    return [...this.channels.entries()].some(
      ([id, c]) => c.org === org && c.owner === owner && this.keywords.get(id)?.has(value),
    );
  }

  private toEntity(id: number): ChannelEntity {
    const c = this.channels.get(id)!;
    return {
      id,
      name: c.name,
    };
  }

  private mine(org: number, owner: number): [number, { name: string; sortOrder: number }][] {
    return [...this.channels.entries()]
      .filter(([, c]) => c.org === org && c.owner === owner)
      .map(([id, c]) => [id, c] as [number, { name: string; sortOrder: number }]);
  }

  async findManyChannelRecords(org: number, owner: number): Promise<ChannelEntity[]> {
    return this.mine(org, owner)
      .sort((a, b) => a[1].sortOrder - b[1].sortOrder || a[0] - b[0])
      .map(([id]) => this.toEntity(id));
  }

  /** 조직 범위 이름 목록: 소유자 스코프를 타지 않는 유일한 조회다(표시용 조인) */
  async findChannelRoster(org: number) {
    return [...this.channels.entries()]
      .filter(([, c]) => c.org === org)
      .sort(
        (a, b) =>
          a[1].owner - b[1].owner || a[1].sortOrder - b[1].sortOrder || a[0] - b[0],
      )
      .map(([id, c]) => ({ id, name: c.name, ownerUserId: c.owner }));
  }

  async ensureDefaultChannelExistsRecord(org: number, owner: number): Promise<void> {
    if (this.mine(org, owner).length > 0) return;
    this.channels.set(++this.seq, { org, owner, name: '기본', sortOrder: 0 });
  }

  async findOneChannelRecordById(
    org: number,
    owner: number,
    id: number,
  ): Promise<ChannelEntity | null> {
    const c = this.channels.get(id);
    return c && c.org === org && c.owner === owner ? this.toEntity(id) : null;
  }

  async findOneChannelRecordByName(
    org: number,
    owner: number,
    name: string,
  ): Promise<ChannelEntity | null> {
    const hit = [...this.channels.entries()].find(
      ([, c]) => c.org === org && c.owner === owner && c.name === name,
    );
    return hit ? this.toEntity(hit[0]) : null;
  }

  async countChannelRecords(org: number, owner: number): Promise<number> {
    return this.mine(org, owner).length;
  }

  async createChannelRecord(
    org: number,
    owner: number,
    name: string,
  ): Promise<ChannelEntity> {
    const id = ++this.seq;
    this.channels.set(id, { org, owner, name, sortOrder: this.mine(org, owner).length });
    return this.toEntity(id);
  }

  async updateChannelRecord(
    org: number,
    owner: number,
    id: number,
    name: string,
  ): Promise<ChannelEntity> {
    const c = this.channels.get(id);
    if (!c || c.org !== org || c.owner !== owner) throw new Error('not found');
    c.name = name;
    return this.toEntity(id);
  }

  async reorderChannelRecords(
    org: number,
    owner: number,
    orderedIds: number[],
  ): Promise<void> {
    orderedIds.forEach((id, i) => {
      const c = this.channels.get(id);
      if (c && c.org === org && c.owner === owner) c.sortOrder = i;
    });
  }

  async deleteChannelRecord(org: number, owner: number, id: number): Promise<boolean> {
    const c = this.channels.get(id);
    if (!c || c.org !== org || c.owner !== owner) return false;
    this.channels.delete(id);
    // 실물은 파트/링크를 FK cascade 로 지운 뒤 값 테이블의 고아를 정리한다.
    this.keywords.delete(id);
    return true;
  }
}

describe('ChannelService', () => {
  const ORG = 1;
  const USER = 7;
  /** 같은 조직의 다른 사람: 채널이 섞이지 않는지 확인하는 데 쓴다. */
  const OTHER = 8;
  let service: ChannelService;
  let repo: FakeChannelRepository;

  beforeEach(async () => {
    repo = new FakeChannelRepository();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelService,
        { provide: CHANNEL_REPOSITORY_PORT, useValue: repo },
      ],
    }).compile();
    service = module.get(ChannelService);
  });

  describe('createChannel', () => {
    it('새 채널을 생성하고 이름을 트림해야 한다', async () => {
      const channel = await service.createChannel(ORG, USER, '  유튜브  ');
      expect(channel.name).toBe('유튜브');
    });

    it('이름이 중복이면 Conflict 를 던져야 한다', async () => {
      await service.createChannel(ORG, USER, '유튜브');
      await expect(service.createChannel(ORG, USER, '유튜브')).rejects.toThrow(ConflictException);
    });

    it('남이 쓰는 이름은 내가 쓸 수 있다(이름 유일성은 사람 안에서만)', async () => {
      // 조직 유일이었다면 남의 목록은 보이지도 않는데 이름이 막혀 이유를 알 수 없다.
      await service.createChannel(ORG, OTHER, '유튜브');
      const mine = await service.createChannel(ORG, USER, '유튜브');
      expect(mine.name).toBe('유튜브');
    });
  });

  describe('updateChannel', () => {
    it('없는 채널이면 NotFound 를 던져야 한다', async () => {
      await expect(service.updateChannel(ORG, USER, 999, '새이름')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('남의 채널은 없는 것과 같다(NotFound)', async () => {
      const theirs = await service.createChannel(ORG, OTHER, '남의채널');
      await expect(service.updateChannel(ORG, USER, theirs.id, '가로채기')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('다른 채널과 이름이 겹치면 Conflict 를 던져야 한다', async () => {
      const a = await service.createChannel(ORG, USER, '유튜브');
      await service.createChannel(ORG, USER, '블로그');
      await expect(service.updateChannel(ORG, USER, a.id, '블로그')).rejects.toThrow(
        ConflictException,
      );
    });

    it('이름을 정상 변경해야 한다', async () => {
      const a = await service.createChannel(ORG, USER, '유튜브');
      const updated = await service.updateChannel(ORG, USER, a.id, '네이버');
      expect(updated.name).toBe('네이버');
    });

    it('자동 생성된 기본 채널도 이름을 바꿀 수 있다', async () => {
      // provisioning 으로 생긴 채널이라고 특별할 이유가 없다: 처음 들어온 사람이 이름부터 고친다.
      const [base] = await service.listChannels(ORG, USER);
      const renamed = await service.updateChannel(ORG, USER, base.id, '유튜브');
      expect(renamed.name).toBe('유튜브');
      expect((await service.listChannels(ORG, USER)).map((c) => c.name)).toEqual(['유튜브']);
    });
  });

  describe('deleteChannel', () => {
    it('채널 삭제 시 그 채널 파트에만 있던 키워드는 GC 된다', async () => {
      const c1 = await service.createChannel(ORG, USER, '유튜브');
      await service.createChannel(ORG, USER, '블로그'); // 마지막 채널 삭제 금지를 피한다
      repo.seedKeyword(c1.id, '가성비');
      const removed = await service.deleteChannel(ORG, USER, c1.id);
      expect(removed).toBe(true);
      expect(repo.hasKeywordValue(ORG, USER, '가성비')).toBe(false);
    });

    it('마지막 채널은 삭제할 수 없다(400)', async () => {
      // 채널 최소 하나가 불변식이다. 지우고 재생성에 맡기면 방금 이름 붙인 채널이 '기본'으로
      //   바뀌어 돌아오고 그 채널에 매달린 작업물까지 잃는다.
      const [only] = await service.listChannels(ORG, USER);
      await expect(service.deleteChannel(ORG, USER, only.id)).rejects.toThrow(BadRequestException);
      expect(await service.listChannels(ORG, USER)).toHaveLength(1);
    });

    it('이미 없는 채널 삭제는 멱등하게 false 를 반환한다', async () => {
      await service.createChannel(ORG, USER, 'A');
      await service.createChannel(ORG, USER, 'B');
      expect(await service.deleteChannel(ORG, USER, 12345)).toBe(false);
    });

    it('남의 채널은 지울 수 없다', async () => {
      const theirs = await service.createChannel(ORG, OTHER, '남의채널');
      await service.createChannel(ORG, OTHER, '남의채널2');
      await service.createChannel(ORG, USER, '내채널');
      await service.createChannel(ORG, USER, '내채널2');
      expect(await service.deleteChannel(ORG, USER, theirs.id)).toBe(false);
      expect((await service.listChannels(ORG, OTHER)).map((c) => c.name)).toContain('남의채널');
    });
  });

  describe('reorderChannels (본인 목록 순서)', () => {
    it('생성 순서대로 정렬된다', async () => {
      await service.createChannel(ORG, USER, 'A');
      await service.createChannel(ORG, USER, 'B');
      await service.createChannel(ORG, USER, 'C');
      expect((await service.listChannels(ORG, USER)).map((c) => c.name)).toEqual(['A', 'B', 'C']);
    });

    it('orderedIds 순서대로 표시 순서를 바꾼다', async () => {
      const a = await service.createChannel(ORG, USER, 'A');
      const b = await service.createChannel(ORG, USER, 'B');
      const c = await service.createChannel(ORG, USER, 'C');
      await service.reorderChannels(ORG, USER, [c.id, a.id, b.id]);
      expect((await service.listChannels(ORG, USER)).map((x) => x.name)).toEqual(['C', 'A', 'B']);
    });

    it('남의 채널 id 가 섞여 와도 그 채널 순서는 바뀌지 않는다', async () => {
      const theirs = await service.createChannel(ORG, OTHER, 'T1');
      await service.createChannel(ORG, OTHER, 'T2');
      const mine = await service.createChannel(ORG, USER, 'A');
      await service.reorderChannels(ORG, USER, [theirs.id, mine.id]);
      expect((await service.listChannels(ORG, OTHER)).map((c) => c.name)).toEqual(['T1', 'T2']);
    });
  });

  describe('listChannels (첫 진입 provisioning)', () => {
    it('채널이 없으면 기본 채널을 자동 생성해 반환한다', async () => {
      const list = await service.listChannels(ORG, USER);
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('기본');
    });

    it('이미 채널이 있으면 자동 생성하지 않는다', async () => {
      await service.createChannel(ORG, USER, '유튜브');
      const list = await service.listChannels(ORG, USER);
      expect(list.map((c) => c.name)).toEqual(['유튜브']);
    });

    it('사람마다 자기 채널만 본다', async () => {
      // 채널을 개인 소유로 내린 이유 그 자체다. 남의 채널이 목록에 오면 그 안의 작업물까지 노출된다.
      await service.createChannel(ORG, USER, '내채널');
      await service.createChannel(ORG, OTHER, '남의채널');
      expect((await service.listChannels(ORG, USER)).map((c) => c.name)).toEqual(['내채널']);
      expect((await service.listChannels(ORG, OTHER)).map((c) => c.name)).toEqual(['남의채널']);
    });

    it('사람마다 따로 provisioning 된다', async () => {
      expect((await service.listChannels(ORG, USER))[0].name).toBe('기본');
      // 앞사람이 기본 채널을 만들었다는 사실이 뒷사람의 provisioning 을 막지 않는다.
      expect((await service.listChannels(ORG, OTHER))[0].name).toBe('기본');
      expect(await service.listChannels(ORG, USER)).toHaveLength(1);
    });
  });

  describe('listChannelRoster (조직 범위 이름 조회)', () => {
    it('남이 만든 채널도 함께 반환한다', async () => {
      // 이 통로가 없으면 조직 전체 원장(활동 로그)이 남의 채널 id 를 이름으로 바꿀 수 없어
      //   전부 '삭제된 채널' 로 보인다. 실제로 그 상태였다.
      await service.createChannel(ORG, USER, '내채널');
      await service.createChannel(ORG, OTHER, '남의채널');
      const roster = await service.listChannelRoster(ORG);
      // 양쪽에 같은 정렬을 걸어 비교한다(한국어 기본 정렬 순서에 기대지 않는다)
      expect(roster.map((c) => c.name).sort()).toEqual(['내채널', '남의채널'].sort());
    });

    it('주인 id 를 함께 반환한다(같은 이름을 갈라줄 근거)', async () => {
      // 이름은 주인 안에서만 유일하다. 조직 범위로 모으면 같은 이름이 여럿 나온다.
      await service.createChannel(ORG, USER, '기본');
      await service.createChannel(ORG, OTHER, '기본');
      const roster = await service.listChannelRoster(ORG);
      expect(roster).toHaveLength(2);
      expect(roster.map((c) => c.ownerUserId).sort()).toEqual([USER, OTHER].sort());
    });

    it('다른 조직의 채널은 오지 않는다', async () => {
      await service.createChannel(ORG, USER, '내채널');
      await service.createChannel(ORG + 1, USER, '다른조직채널');
      expect((await service.listChannelRoster(ORG)).map((c) => c.name)).toEqual(['내채널']);
    });

    it('기본 채널을 만들지 않는다', async () => {
      // listChannels 와 다른 점이다. 조회하는 쪽이 남의 provisioning 을 대신 트리거하면
      //   도구에 들어온 적 없는 사람에게도 채널이 생겨 목록이 사실과 어긋난다.
      expect(await service.listChannelRoster(ORG)).toEqual([]);
      expect(await service.listChannels(ORG, USER)).toHaveLength(1);
    });
  });

  describe('getChannel', () => {
    it('남의 채널은 null 이다(존재를 알려주지 않는다)', async () => {
      const theirs = await service.createChannel(ORG, OTHER, '남의채널');
      expect(await service.getChannel(ORG, USER, theirs.id)).toBeNull();
      expect(await service.getChannel(ORG, OTHER, theirs.id)).not.toBeNull();
    });
  });
});
