import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ChannelSettingsService } from '../channel-settings.service';
import { resolveConceptText } from '../../../domain';
import {
  ChannelSettingsRepositoryPort,
  CHANNEL_SETTINGS_REPOSITORY_PORT,
  ChannelSettingsRecord,
  DataCollectorPort,
  DATA_COLLECTOR_PORT,
  UserToolSettingsRecord,
  UserToolSettingsRepositoryPort,
  USER_TOOL_SETTINGS_REPOSITORY_PORT,
} from '../../ports/outbound';
import {
  ChannelPort,
  CHANNEL_PORT,
} from '../../../../../channel/core/application/ports/inbound';
import { ChannelEntity } from '../../../../../channel/core/domain';
import type { ToolVersion } from '../../../../../../shared/domain/tool-version';
import { ownerVersionScope } from '../../../../../../shared/domain/workspace-scope';

/** 두 버전을 짧게 가리키는 상수(스코프 헬퍼 `at` 의 인자) */
const V15: ToolVersion = 'v1.5';
const V10: ToolVersion = 'v1.0';

/**
 * 채널 존재 확인만 하는 페이크. 테스트가 seed 해서 "이 채널은 있다"는 사실만 제공
 */
class FakeChannelPort implements ChannelPort {
  private seq = 0;
  private channels = new Map<number, { org: number; owner: number; name: string }>();

  /** 채널은 개인 소유. 소유자를 함께 심어야 "남의 채널은 없는 것과 같다" 가 검증 가능 */
  seed(org: number, owner: number, name: string): ChannelEntity {
    const id = ++this.seq;
    this.channels.set(id, { org, owner, name });
    return { id, name };
  }

  /** 조직 범위 이름 목록. 이 도메인은 쓰지 않지만 포트를 충실히 구현해 둔다(소유자 무관) */
  async listChannelRoster(org: number) {
    return [...this.channels.entries()]
      .filter(([, c]) => c.org === org)
      .map(([id, c]) => ({ id, name: c.name, ownerUserId: c.owner }));
  }

  async getChannel(org: number, owner: number, id: number): Promise<ChannelEntity | null> {
    const c = this.channels.get(id);
    return c && c.org === org && c.owner === owner ? { id, name: c.name } : null;
  }

  // 설정 도메인이 쓰지 않는 계약(채널 CRUD)은 이 페이크의 관심사가 아님
  async listChannels(): Promise<ChannelEntity[]> {
    throw new Error('not used');
  }
  async createChannel(): Promise<ChannelEntity> {
    throw new Error('not used');
  }
  async updateChannel(): Promise<ChannelEntity> {
    throw new Error('not used');
  }
  async deleteChannel(): Promise<boolean> {
    throw new Error('not used');
  }
  async reorderChannels(): Promise<void> {
    throw new Error('not used');
  }
}

type FakeUserRow = {
  aiModels: string | null;
  brandConcepts: string | null;
  entryVersion: string;
  defaultChannelId: number | null;
};

/**
 * 개인 도구 설정 인메모리 페이크. 실제 테이블처럼 (조직, 유저) 로 키를 잡는다:
 * 사람마다 분리된다는 것이 이 저장소의 유일한 계약이라 키를 흉내내야 그 회귀가 잡힌다.
 *
 * 네 값이 한 행에 있고 upsert 는 준 필드만 갱신한다. 이 부분 갱신이 깨지면 "설정했는데 사라졌다"가
 * 되므로 페이크도 같은 규칙을 지켜야 그 회귀가 여기서 잡힌다.
 */
class FakeUserToolSettingsRepository implements UserToolSettingsRepositoryPort {
  private rows = new Map<string, FakeUserRow>();
  private key = (org: number, user: number) => `${org}:${user}`;

  async findRecord(org: number, ownerUserId: number): Promise<UserToolSettingsRecord | null> {
    const row = this.rows.get(this.key(org, ownerUserId));
    return row ? { ownerUserId, ...row } : null;
  }

  async upsertAiModelsRecord(
    org: number,
    ownerUserId: number,
    aiModels: string,
  ): Promise<UserToolSettingsRecord> {
    return this.patch(org, ownerUserId, { aiModels });
  }

  async upsertBrandConceptsRecord(
    org: number,
    ownerUserId: number,
    brandConcepts: string,
  ): Promise<UserToolSettingsRecord> {
    return this.patch(org, ownerUserId, { brandConcepts });
  }

  async upsertEntryVersionRecord(
    org: number,
    ownerUserId: number,
    entryVersion: string,
  ): Promise<UserToolSettingsRecord> {
    return this.patch(org, ownerUserId, { entryVersion });
  }

  async upsertDefaultChannelRecord(
    org: number,
    ownerUserId: number,
    defaultChannelId: number | null,
  ): Promise<UserToolSettingsRecord> {
    return this.patch(org, ownerUserId, { defaultChannelId });
  }

  /** 실제 어댑터처럼 준 필드만 갱신. 한쪽 저장이 다른 쪽을 덮으면 안 됨 */
  private patch(
    org: number,
    ownerUserId: number,
    p: Partial<FakeUserRow>,
  ): UserToolSettingsRecord {
    const cur =
      this.rows.get(this.key(org, ownerUserId)) ??
      { aiModels: null, brandConcepts: null, entryVersion: 'v1.5', defaultChannelId: null };
    const next = { ...cur, ...p };
    this.rows.set(this.key(org, ownerUserId), next);
    return { ownerUserId, ...next };
  }
}

class FakeDataCollector implements DataCollectorPort {
  // 키워드 원천 조회와 선택지는 이 스펙 범위가 아니다(수집 후보 조립은 plan-generation 스펙이 검증한다)
  //   포트를 구현하는 클래스라 빠뜨리지 않고 두되, 불리면 실패하게 해 조용한 통과 차단
  async fetchAdKeywords(): Promise<never> {
    throw new Error('not used');
  }
  async fetchShoppingInsight(): Promise<never> {
    throw new Error('not used');
  }
  async fetchGoogleTrends(): Promise<never> {
    throw new Error('not used');
  }
  async fetchNateRealtime(): Promise<never> {
    throw new Error('not used');
  }
  async getSourceOptions(): Promise<never> {
    throw new Error('not used');
  }
}

class FakeChannelSettingsRepository implements ChannelSettingsRepositoryPort {
  private store = new Map<string, ChannelSettingsRecord>();
  private key(channelId: number, sourceKey: string) {
    return `${channelId}:${sourceKey}`;
  }
  async findRecord(
    channelId: number,
    sourceKey: string,
  ): Promise<ChannelSettingsRecord | null> {
    return this.store.get(this.key(channelId, sourceKey)) ?? null;
  }
  async upsertRecord(
    _organizationId: number,
    channelId: number,
    sourceKey: string,
    settings: string,
  ): Promise<ChannelSettingsRecord> {
    const rec = { channelId, sourceKey, settings };
    this.store.set(this.key(channelId, sourceKey), rec);
    return rec;
  }
}


describe('ChannelSettingsService', () => {
  const ORG = 1;
  /** 보는 사람: 버전 스코프(모델/브랜드컨셉)가 이 값으로 슬롯을 고른다. */
  const USER = 7;
  let service: ChannelSettingsService;
  let dataCollector: FakeDataCollector;
  let settings: FakeChannelSettingsRepository;
  let channels: FakeChannelPort;
  let userSettings: FakeUserToolSettingsRepository;

  beforeEach(async () => {
    dataCollector = new FakeDataCollector();
    settings = new FakeChannelSettingsRepository();
    channels = new FakeChannelPort();
    userSettings = new FakeUserToolSettingsRepository();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelSettingsService,
        { provide: CHANNEL_SETTINGS_REPOSITORY_PORT, useValue: settings },
        { provide: DATA_COLLECTOR_PORT, useValue: dataCollector },
        { provide: CHANNEL_PORT, useValue: channels },
        { provide: USER_TOOL_SETTINGS_REPOSITORY_PORT, useValue: userSettings },
      ],
    }).compile();
    service = module.get(ChannelSettingsService);
  });

  /**
   * 버전 스코프 하나. `(ORG, USER)` 인자 쌍을 대체
   *
   * 버전이 인자로 들어오는 것이 이 리팩터의 핵심이다: 저장된 "보는 버전" 을 읽던 시절에는 요청
   * 하나가 여러 번 읽는 사이에 그 값이 바뀔 수 있었다.
   */
  const at = (version: ToolVersion, user = USER, org = ORG) =>
    ownerVersionScope({ organizationId: org, ownerUserId: user, version });

  /** 채널 하나를 준비한다(채널에 붙는 설정은 기획 프롬프트 지침과 진입 채널 지정뿐이다) */
  function makeChannel(name = '유튜브'): ChannelEntity {
    return channels.seed(ORG, USER, name);
  }

  describe('ai model (개인 AI 모델 선택: LLM/영상 생성/TTS + TTS 음성/피치)', () => {
    const empty = { llm: '', video: '', videoMode: '', tts: '', ttsVoice: '', ttsPitch: '', image: '' };

    it('고른 적이 없으면 빈 선택을 반환한다', async () => {
      expect(await service.getAiModels(at(V15))).toEqual(empty);
    });

    it('사람마다 따로 저장되어 서로의 선택을 덮지 않는다', async () => {
      // 이 도메인이 채널에서 개인으로 옮겨 온 이유 그 자체다. 한 사람의 저장이 다른 사람에게
      //   번지면 옮긴 의미가 없고, 화면에서는 "내가 안 고른 모델이 골라져 있다"로 보인다.
      const OTHER = 8;
      await service.setAiModels(at(V15), { ...empty, llm: 'claude-sonnet-5' });
      await service.setAiModels(at(V15, OTHER), { ...empty, llm: 'claude-opus-4-8' });

      expect((await service.getAiModels(at(V15))).llm).toBe('claude-sonnet-5');
      expect((await service.getAiModels(at(V15, OTHER))).llm).toBe('claude-opus-4-8');
    });

    it('버전이 다르면 모델을 공유하지 않는다', async () => {
      // v1.0 과 v1.5 는 화면 구성이 다른 별개의 도구처럼 쓰인다. 한 버전에서 고른 모델이 다른
      //   버전에 새면 "안 바꿨는데 모델이 바뀌어 있다" 가 됨
      await service.setAiModels(at(V15), { ...empty, llm: 'claude-sonnet-5' });
      expect(await service.getAiModels(at(V10))).toEqual(empty); // v1.0 은 아직 고른 적 없다

      await service.setAiModels(at(V10), { ...empty, llm: 'claude-opus-4-8' });
      expect((await service.getAiModels(at(V10))).llm).toBe('claude-opus-4-8');

      // 한 쪽 저장이 다른 쪽을 덮지 않는다(맵에서 그 버전 키만 바꾼다)
      expect((await service.getAiModels(at(V15))).llm).toBe('claude-sonnet-5');
    });

    it('진입 기본 버전은 모델 슬롯을 고르지 않는다', async () => {
      // 요청이 슬롯을 정하므로 진입 기본값을 바꿔도 같은 스코프로 읽는 값은 그대로여야 함
      //   (그러지 않으면 축이 다시 두 개가 된다)
      await service.setAiModels(at(V15), { ...empty, llm: 'claude-sonnet-5' });
      await service.setEntryVersion(ORG, USER, 'v1.0');
      expect((await service.getAiModels(at(V15))).llm).toBe('claude-sonnet-5');
    });

    it('모르는 진입 버전은 기본 버전으로 좁힌다', async () => {
      // 진입이 막히면 안 되고, 도달할 수 없는 값이 남아도 안 된다(요청 경로는 반대로 400 이다)
      expect(await service.setEntryVersion(ORG, USER, 'v9.9')).toBe('v1.5');
      expect(await service.getEntryVersion(ORG, USER)).toBe('v1.5');
    });

    it('진입 채널은 사람마다 따로다', async () => {
      // 조직 공유 '대표 채널'을 대신하는 개인 설정이다. 한 사람의 지정이 다른 사람의 첫 화면을
      //   바꾸면 옮긴 의미가 없음
      const OTHER = 8;
      expect(await service.getDefaultChannelId(ORG, USER)).toBeNull();

      await service.setDefaultChannelId(ORG, USER, 3);
      expect(await service.getDefaultChannelId(ORG, USER)).toBe(3);
      expect(await service.getDefaultChannelId(ORG, OTHER)).toBeNull();
    });

    it('진입 채널 해제는 null 로 돌아간다(호출부가 첫 채널로 접는다)', async () => {
      await service.setDefaultChannelId(ORG, USER, 3);
      expect(await service.setDefaultChannelId(ORG, USER, null)).toBeNull();
      expect(await service.getDefaultChannelId(ORG, USER)).toBeNull();
    });

    it('진입 채널과 모델 선택은 서로 덮지 않는다', async () => {
      // 같은 행의 다른 필드. 한쪽 저장이 다른 쪽을 덮으면 "설정했는데 사라졌다" 가 됨
      await service.setAiModels(at(V15), { ...empty, llm: 'claude-sonnet-5' });
      await service.setDefaultChannelId(ORG, USER, 7);
      expect((await service.getAiModels(at(V15))).llm).toBe('claude-sonnet-5');
      expect(await service.getDefaultChannelId(ORG, USER)).toBe(7);
    });

    it('진입 버전을 고른 적 없으면 기본 버전이다', async () => {
      expect(await service.getEntryVersion(ORG, USER)).toBe('v1.5');
    });

    it('같은 유저 id 라도 조직이 다르면 조회되지 않는다', async () => {
      // 조직유저 id 는 조직마다 독립 시퀀스가 아니지만, 스코프를 조직까지 걸어야 남의 조직 행을
      //   집지 않는다(테이블 유니크 키가 (조직, 유저)인 이유)
      await service.setAiModels(at(V15), { ...empty, llm: 'claude-sonnet-5' });
      expect(await service.getAiModels(at(V15, USER, ORG + 1))).toEqual(empty);
    });

    it('역량별로 트림해 저장하고 조회되며, 빈 값이면 미지정으로 돌아간다', async () => {
      const saved = await service.setAiModels(at(V15), {
        ...empty,
        llm: '  claude-sonnet-5 ',
        video: 'runway',
      });
      expect(saved).toEqual({ ...empty, llm: 'claude-sonnet-5', video: 'runway' });
      expect(await service.getAiModels(at(V15))).toEqual(saved);

      await service.setAiModels(at(V15), empty);
      expect(await service.getAiModels(at(V15))).toEqual(empty);
    });

    it('TTS 모델과 음성/피치를 함께 저장하고 조회한다', async () => {
      const saved = await service.setAiModels(at(V15), {
        ...empty,
        tts: 'edge-tts',
        ttsVoice: 'ko-KR-SunHiNeural',
        ttsPitch: '+0Hz',
      });
      expect(saved).toEqual({
        ...empty,
        tts: 'edge-tts',
        ttsVoice: 'ko-KR-SunHiNeural',
        ttsPitch: '+0Hz',
      });
      expect(await service.getAiModels(at(V15))).toEqual(saved);
    });

    it('AI 모델과 브랜드/컨셉은 서로를 덮지 않는다', async () => {
      // 둘이 같은 행의 다른 컬럼이 되었으므로 이제 부분 upsert 만이 이걸 지킨다. 한쪽 저장이
      //   행을 통째로 다시 쓰면 다른 쪽이 사라지고, 화면에서는 "설정했는데 없어졌다"로 보인다.
      await service.setAiModels(at(V15), { ...empty, llm: 'claude-opus-4-8', tts: 'internal-tts' });
      await service.setBrandConceptSets(at(V15), [
        { brandName: 'B', brandDescription: '', concepts: [] },
      ]);
      expect(await service.getAiModels(at(V15))).toEqual({
        ...empty,
        llm: 'claude-opus-4-8',
        tts: 'internal-tts',
      });
      expect(await service.getBrandConceptSets(at(V15))).toEqual([
        { brandName: 'B', brandDescription: '', concepts: [], customAxes: [], customOptions: [] },
      ]);

      // 반대 방향도 동일. 세트를 다시 저장해도 모델 선택은 유지
      await service.setBrandConceptSets(at(V15), [
        { brandName: 'C', brandDescription: '', concepts: [] },
      ]);
      expect((await service.getAiModels(at(V15))).llm).toBe('claude-opus-4-8');
    });

    it('버전 전환과 진입 채널 지정이 두 설정을 덮지 않는다', async () => {
      // 같은 행 네 필드의 독립성. 버전만 바꾸는 호출이 값 맵을 실어 보내면 그 순간 되돌아감
      const c = makeChannel('유튜브');
      await service.setAiModels(at(V15), { ...empty, llm: 'claude-opus-4-8' });
      await service.setBrandConceptSets(at(V15), [{ brandName: 'B', brandDescription: '', concepts: [] }]);

      await service.setEntryVersion(ORG, USER, 'v1.5');
      await service.setDefaultChannelId(ORG, USER, c.id);

      expect((await service.getAiModels(at(V15))).llm).toBe('claude-opus-4-8');
      expect((await service.getBrandConceptSets(at(V15)))[0].brandName).toBe('B');
    });
  });

  describe('brand/concept (개인 브랜드/컨셉 세트: 여러 개, 브랜드 설명 + 축별 선택)', () => {
    const emptyRest = { brandDescription: '', concepts: [] };

    it('설정이 없으면 빈 배열을 반환한다', async () => {
      expect(await service.getBrandConceptSets(at(V15))).toEqual([]);
    });

    it('사람마다 따로 저장되어 서로의 세트를 보지 않는다', async () => {
      // 채널에서 개인으로 옮긴 이유 그 자체다. 같은 채널을 함께 쓰는 두 사람이 서로 다른 브랜드를
      //   가질 수 있어야 하고, 남의 목록이 내 화면에 나타나면 안 됨
      const OTHER = 8;
      await service.setBrandConceptSets(at(V15), [{ brandName: '내브랜드', ...emptyRest }]);
      await service.setBrandConceptSets(at(V15, OTHER), [{ brandName: '남브랜드', ...emptyRest }]);

      expect((await service.getBrandConceptSets(at(V15)))[0].brandName).toBe('내브랜드');
      expect((await service.getBrandConceptSets(at(V15, OTHER)))[0].brandName).toBe('남브랜드');
    });

    it('같은 유저 id 라도 조직이 다르면 조회되지 않는다', async () => {
      // 개인 스코프의 키는 (조직, 유저). 조직을 빼면 납품된 다른 조직의 설정이 새어 나감
      await service.setBrandConceptSets(at(V15), [{ brandName: '내브랜드', ...emptyRest }]);
      expect(await service.getBrandConceptSets(at(V15, USER, ORG + 1))).toEqual([]);
    });

    it('브랜드명이 같은 세트는 마지막 것만 남는다', async () => {
      // 브랜드명이 세트 식별자다: 생성 경로가 이름으로 찾고, 저장된 기획안이 이름으로 다시 찾고,
      //   화면은 이름으로 목록을 그린다. 중복을 허용하면 찾기는 앞의 것만 집고 화면은 구별할 수
      //   없는 항목 둘을 표시
      const saved = await service.setBrandConceptSets(at(V15), [
        { brandName: '같은이름', brandDescription: '먼저', concepts: [] },
        { brandName: '다른이름', ...emptyRest },
        { brandName: '같은이름', brandDescription: '나중', concepts: [] },
      ]);
      expect(saved).toHaveLength(2);
      // 자리는 첫 등장 순서를 지키고 내용은 나중 것이 이긴다(방금 고친 쪽이 현재 정의다)
      expect(saved.map((s) => s.brandName)).toEqual(['같은이름', '다른이름']);
      expect(saved[0].brandDescription).toBe('나중');
    });

    it('여러 세트를 트림해 저장하고, 브랜드명 없는 세트는 제거한다', async () => {
      const styleText = resolveConceptText('style', 'live-action-closeup')!;
      const toneText = resolveConceptText('tone', 'friendly-mom')!;
      const saved = await service.setBrandConceptSets(at(V15), [
        {
          brandName: '  브랜드A ',
          brandDescription: '  설명A  ',
          concepts: [
            { axis: ' style ', option: ' live-action-closeup ' },
            { axis: 'mood', option: '' }, // 옵션 없어 제거
          ],
        },
        { brandName: '', brandDescription: '무시됨', concepts: [] },
        {
          brandName: '브랜드B',
          brandDescription: '',
          concepts: [{ axis: 'tone', option: 'friendly-mom' }],
        },
      ]);
      // 트림 + axis/option 없는 컨셉 제거 + 브랜드명 없는 세트 제거 + 문구는 카탈로그가 채운다.
      // 커스텀 카테고리를 쓰지 않아도 응답에는 빈 배열이 온다(읽는 쪽이 없음을 다루지 않게)
      expect(saved).toEqual([
        {
          brandName: '브랜드A',
          brandDescription: '설명A',
          concepts: [
            { axis: 'style', option: 'live-action-closeup', label: styleText.label, note: styleText.note },
          ],
          customAxes: [],
          customOptions: [],
        },
        {
          brandName: '브랜드B',
          brandDescription: '',
          concepts: [
            { axis: 'tone', option: 'friendly-mom', label: toneText.label, note: toneText.note },
          ],
          customAxes: [],
          customOptions: [],
        },
      ]);
      // 문구는 저장분이 아니라 카탈로그에서 나온다(key 만 저장하는 설계의 회귀 지점)
      expect(saved[0].concepts[0].label).toBe(styleText.label);
      expect(await service.getBrandConceptSets(at(V15))).toEqual(saved);
    });

    it('선택지에 없는 컨셉은 저장을 거절한다', async () => {
      await expect(
        service.setBrandConceptSets(at(V15), [
          {
            brandName: '브랜드A',
            brandDescription: '',
            concepts: [{ axis: 'style', option: 'retired-option' }],
          },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('카탈로그에서 사라진 옵션은 조회에서 빠진다', async () => {
      // 카탈로그에 있던 시절 저장된 행(옵션이 나중에 목록에서 빠진 상황)
      await userSettings.upsertBrandConceptsRecord(
        ORG,
        USER,
        JSON.stringify({
          'v1.5': {
            sets: [
              {
                brandName: '브랜드A',
                brandDescription: '',
                concepts: [
                  { axis: 'style', option: 'retired-option' },
                  { axis: 'mood', option: 'warm-cozy' },
                ],
              },
            ],
          },
        }),
      );
      // key 를 문구 대신 쓰면 그 key 가 그대로 프롬프트에 실림. 남은 선택만 반환
      const sets = await service.getBrandConceptSets(at(V15));
      expect(sets[0].concepts.map((x) => x.option)).toEqual(['warm-cozy']);
    });

    it('버전이 다르면 브랜드/컨셉을 공유하지 않는다', async () => {
      // AI 모델과 같은 규칙이다. 한 버전에서 잡은 연출 방향이 다른 버전에 새면 "안 바꿨는데
      //   기획서 톤이 바뀌었다" 가 되고, 그것은 결과물을 보고서야 알게 됨
      await service.setBrandConceptSets(at(V15), [
        { brandName: 'v15브랜드', brandDescription: '', concepts: [] },
      ]);

      expect(await service.getBrandConceptSets(at(V10))).toEqual([]);

      await service.setBrandConceptSets(at(V10), [
        { brandName: 'v10브랜드', brandDescription: '', concepts: [] },
      ]);
      expect((await service.getBrandConceptSets(at(V10)))[0].brandName).toBe('v10브랜드');

      // 한 쪽 저장이 다른 쪽을 덮지 않는다(맵을 다시 쓸 때 다른 슬롯을 잃지 않는다)
      expect((await service.getBrandConceptSets(at(V15)))[0].brandName).toBe('v15브랜드');
    });

    it('버전 이전 형태(최상위 sets)는 기본 버전 것으로 읽는다', async () => {
      // 이관이 그 형태를 잘못 읽었을 때의 마지막 그물. 못 읽고 지나가면 브랜드 목록이 아무 에러
      //   없이 사라진다.
      await userSettings.upsertBrandConceptsRecord(
        ORG,
        USER,
        JSON.stringify({ sets: [{ brandName: '구형태', brandDescription: '', concepts: [] }] }),
      );
      expect((await service.getBrandConceptSets(at(V15)))[0].brandName).toBe('구형태');
    });

    it('교체 저장이므로 빈 배열로 저장하면 전부 삭제된다', async () => {
      await service.setBrandConceptSets(at(V15), [{ brandName: 'A', ...emptyRest }]);
      await service.setBrandConceptSets(at(V15), []);
      expect(await service.getBrandConceptSets(at(V15))).toEqual([]);
    });

    describe('커스텀 카테고리/레퍼런스 (세트가 스스로 더한 것)', () => {
      const AXIS = 'x:1a2b3c4d';
      const OPT = 'x:9f8e7d6c';

      /** 커스텀 축 하나 + 그 축의 레퍼런스 하나를 고른 세트. 대부분의 케이스가 이 모양에서 출발 */
      const setWithCustomAxis = () => ({
        brandName: '브랜드A',
        brandDescription: '',
        concepts: [{ axis: AXIS, option: OPT }],
        customAxes: [{ key: AXIS, label: '계절감' }],
        customOptions: [
          { axis: AXIS, key: OPT, label: '오션 무드', description: '파스텔톤 바닷가' },
        ],
      });

      it('커스텀 카테고리와 그 선택을 저장하고 문구까지 채워 돌려준다', async () => {
        const saved = await service.setBrandConceptSets(at(V15), [setWithCustomAxis()]);
        expect(saved[0].customAxes).toEqual([{ key: AXIS, label: '계절감' }]);
        // 카탈로그가 모르는 축이라 축 이름은 선택에 실려야 프롬프트에서 key 로 나가지 않음
        expect(saved[0].concepts).toEqual([
          {
            axis: AXIS,
            option: OPT,
            label: '오션 무드',
            note: '파스텔톤 바닷가',
            axisLabel: '계절감',
          },
        ]);
        expect(await service.getBrandConceptSets(at(V15))).toEqual(saved);
      });

      it('기본 카테고리에도 레퍼런스를 더할 수 있다', async () => {
        const saved = await service.setBrandConceptSets(at(V15), [
          {
            brandName: '브랜드A',
            brandDescription: '',
            concepts: [{ axis: 'style', option: OPT }],
            customOptions: [{ axis: 'style', key: OPT, label: '내 연출', description: '' }],
          },
        ]);
        // 축이 카탈로그의 것이므로 축 이름은 카탈로그가 안다(axisLabel 을 싣지 않는다)
        expect(saved[0].concepts).toEqual([
          { axis: 'style', option: OPT, label: '내 연출', note: '' },
        ]);
      });

      it('기본 카테고리의 문구는 커스텀이 덮지 못한다', async () => {
        const original = resolveConceptText('style', 'live-action-closeup')!;
        const saved = await service.setBrandConceptSets(at(V15), [
          {
            brandName: '브랜드A',
            brandDescription: '',
            concepts: [{ axis: 'style', option: 'live-action-closeup' }],
            // 기본 옵션 key 를 사칭해 문구를 바꾸려는 정의(key 형식에서 걸린다)
            customOptions: [
              {
                axis: 'style',
                key: 'live-action-closeup',
                label: '탈취된 라벨',
                description: '주입',
              },
            ],
          },
        ]);
        expect(saved[0].customOptions).toEqual([]);
        expect(saved[0].concepts[0].label).toBe(original.label);
      });

      it('key 형식이 어긋난 정의는 버린다(기본 축 key 사칭 차단)', async () => {
        const saved = await service.setBrandConceptSets(at(V15), [
          {
            brandName: '브랜드A',
            brandDescription: '',
            concepts: [],
            customAxes: [
              { key: 'mood', label: '가짜 무드' }, // 접두사 없음
              { key: 'x:ZZZZ', label: 'hex 아님' },
              { key: 'x:1a', label: '너무 짧음' },
            ],
          },
        ]);
        expect(saved[0].customAxes).toEqual([]);
      });

      it('없는 카테고리를 가리키는 레퍼런스는 버린다', async () => {
        const saved = await service.setBrandConceptSets(at(V15), [
          {
            brandName: '브랜드A',
            brandDescription: '',
            concepts: [],
            customOptions: [
              { axis: 'x:deadbeef', key: OPT, label: '고아', description: '' },
            ],
          },
        ]);
        expect(saved[0].customOptions).toEqual([]);
      });

      it('카테고리를 지우면 그 레퍼런스와 그 축의 선택이 함께 사라진다', async () => {
        await service.setBrandConceptSets(at(V15), [setWithCustomAxis()]);
        // 세트 단건 경로로 바꾼다(카테고리 관리 모달의 저장에 해당)
        // 선택을 그대로 실어 보내도 정의가 없으면 갈 곳이 없어 서버가 걸러낸다.
        const after = await service.setBrandConceptSetDetail(at(V15), '브랜드A', {
          customAxes: [],
          customOptions: [],
          concepts: [{ axis: AXIS, option: OPT }],
        });
        expect(after[0].customAxes).toEqual([]);
        expect(after[0].customOptions).toEqual([]);
        // 선택까지 폐기 필요. 남기면 뒤의 검증이 400 을 던져 편집 전체가 저장되지 않음
        expect(after[0].concepts).toEqual([]);
      });

      it('카테고리 이름을 바꿔도 이미 고른 선택은 유지된다', async () => {
        await service.setBrandConceptSets(at(V15), [setWithCustomAxis()]);
        const base = setWithCustomAxis();
        const renamed = await service.setBrandConceptSetDetail(at(V15), '브랜드A', {
          customAxes: [{ key: AXIS, label: '분위기' }],
          customOptions: [{ ...base.customOptions[0], label: '숲 무드' }],
          concepts: [{ axis: AXIS, option: OPT }],
        });
        // key 가 그대로라 선택이 살아남고 문구만 새 이름을 따른다.
        expect(renamed[0].concepts).toEqual([
          { axis: AXIS, option: OPT, label: '숲 무드', note: '파스텔톤 바닷가', axisLabel: '분위기' },
        ]);
      });

      it('모달에서 고른 레퍼런스가 저장된다', async () => {
        // 선택을 두 화면에서 다룸. 이 경로로 고른 것도 남아야 다음 조회와 생성이 그것을 사용
        await service.setBrandConceptSets(at(V15), [{ brandName: '브랜드A', ...emptyRest }]);
        const after = await service.setBrandConceptSetDetail(at(V15), '브랜드A', {
          customAxes: [],
          customOptions: [],
          concepts: [{ axis: 'style', option: 'live-action-closeup' }],
        });
        expect(after[0].concepts.map((c) => c.option)).toEqual(['live-action-closeup']);
        expect((await service.getBrandConceptSets(at(V15)))[0].concepts.map((c) => c.option)).toEqual(
          ['live-action-closeup'],
        );
      });

      it('나중에 저장한 쪽이 남는다(선택은 양쪽에서 저장된다)', async () => {
        await service.setBrandConceptSets(at(V15), [{ brandName: '브랜드A', ...emptyRest }]);
        // 모달에서 고르고 저장
        await service.setBrandConceptSetDetail(at(V15), '브랜드A', {
          customAxes: [],
          customOptions: [],
          concepts: [{ axis: 'mood', option: 'warm-cozy' }],
        });
        // 모달을 나와 카드에서 다시 고르고 하단 바로 저장
        const after = await service.setBrandConceptSets(at(V15), [
          {
            brandName: '브랜드A',
            brandDescription: '',
            concepts: [{ axis: 'mood', option: 'bright-vivid' }],
          },
        ]);
        expect(after[0].concepts.map((c) => c.option)).toEqual(['bright-vivid']);
      });

      it('저장된 적 없는 브랜드에는 정의를 붙일 수 없다', async () => {
        // 정의와 선택 모두 세트 안에 산다. 붙일 자리가 없으면 조용히 만들지 않고 세운다.
        await expect(
          service.setBrandConceptSetDetail(at(V15), '없는브랜드', {
            customAxes: [{ key: AXIS, label: '계절감' }],
            customOptions: [],
            concepts: [],
          }),
        ).rejects.toThrow(NotFoundException);
      });

      it('세트 단건 저장은 브랜드명/설명과 다른 세트를 건드리지 않는다', async () => {
        await service.setBrandConceptSets(at(V15), [
          {
            brandName: '브랜드A',
            brandDescription: '설명A',
            concepts: [{ axis: 'style', option: 'live-action-closeup' }],
          },
          { brandName: '브랜드B', ...emptyRest },
        ]);
        const after = await service.setBrandConceptSetDetail(at(V15), '브랜드A', {
          customAxes: [{ key: AXIS, label: '계절감' }],
          customOptions: [],
          concepts: [{ axis: 'style', option: 'live-action-closeup' }],
        });
        expect(after[0].brandDescription).toBe('설명A');
        expect(after[1].brandName).toBe('브랜드B');
        expect(after[1].customAxes).toEqual([]);
      });

      it('세트 목록 저장은 정의를 되돌리지 못한다', async () => {
        // 목록 저장에는 정의를 고치는 화면이 없다. 화면이 낡은 정의를 들고 있는 것은 흔한 일이고,
        //   그때 목록을 저장하는 행위가 방금 저장된 카테고리를 지워서는 안 됨
        await service.setBrandConceptSets(at(V15), [{ brandName: '브랜드A', ...emptyRest }]);
        await service.setBrandConceptSetDetail(at(V15), '브랜드A', {
          customAxes: [{ key: AXIS, label: '계절감' }],
          customOptions: [{ axis: AXIS, key: OPT, label: '오션 무드', description: '' }],
          concepts: [],
        });

        // 정의를 아예 싣지 않은(낡은) 목록 저장
        const after = await service.setBrandConceptSets(at(V15), [
          {
            brandName: '브랜드A',
            brandDescription: '설명을 고쳤다',
            concepts: [{ axis: AXIS, option: OPT }],
          },
        ]);
        expect(after[0].customAxes).toEqual([{ key: AXIS, label: '계절감' }]);
        expect(after[0].brandDescription).toBe('설명을 고쳤다');
        // 정의가 남아 있으므로 그것을 가리키는 선택도 유지
        expect(after[0].concepts.map((c) => c.label)).toEqual(['오션 무드']);
      });

      it('브랜드명을 바꾸면 정의가 따라간다', async () => {
        // 정의는 브랜드명으로 찾는다. 새 이름으로는 저장된 값이 없으므로, 그때만 요청이 실어 온
        //   정의를 사용. 그러지 않으면 이름을 고치는 순간 그 세트의 카테고리를 잃음
        await service.setBrandConceptSets(at(V15), [{ brandName: '옛이름', ...emptyRest }]);
        await service.setBrandConceptSetDetail(at(V15), '옛이름', {
          customAxes: [{ key: AXIS, label: '계절감' }],
          customOptions: [],
          concepts: [],
        });
        const renamed = await service.setBrandConceptSets(at(V15), [
          {
            brandName: '새이름',
            brandDescription: '',
            concepts: [],
            customAxes: [{ key: AXIS, label: '계절감' }],
            customOptions: [],
          },
        ]);
        expect(renamed[0].brandName).toBe('새이름');
        expect(renamed[0].customAxes).toEqual([{ key: AXIS, label: '계절감' }]);
      });

      it('이름이 기본 카테고리와 겹치면 버린다', async () => {
        const saved = await service.setBrandConceptSets(at(V15), [
          {
            brandName: '브랜드A',
            brandDescription: '',
            concepts: [],
            customAxes: [{ key: AXIS, label: '무드' }],
          },
        ]);
        // 겹치면 프롬프트에 `무드:` 줄이 둘 실려 모델이 상반된 지시를 받음
        expect(saved[0].customAxes).toEqual([]);
      });

      it('개행과 연속 공백을 한 칸으로 접는다', async () => {
        const saved = await service.setBrandConceptSets(at(V15), [
          {
            brandName: '브랜드A',
            brandDescription: '',
            concepts: [],
            customAxes: [{ key: AXIS, label: '  계절감  ' }],
            customOptions: [
              {
                axis: AXIS,
                key: OPT,
                label: '오션\n무드',
                description: '파스텔톤\n\n바닷가   느낌',
              },
            ],
          },
        ]);
        // 프롬프트가 `카테고리: 라벨, 노트` 한 줄을 만드는 구조라, 개행이 그 줄을 쪼갠다.
        expect(saved[0].customAxes[0].label).toBe('계절감');
        expect(saved[0].customOptions[0].label).toBe('오션 무드');
        expect(saved[0].customOptions[0].description).toBe('파스텔톤 바닷가 느낌');
      });

      it('커스텀 정의는 그 세트에만 딸린다', async () => {
        const saved = await service.setBrandConceptSets(at(V15), [
          setWithCustomAxis(),
          { brandName: '브랜드B', ...emptyRest },
        ]);
        expect(saved[1].customAxes).toEqual([]);
        expect(saved[1].customOptions).toEqual([]);
      });

      it('한 축에서 이름이 겹치는 레퍼런스는 하나만 남는다', async () => {
        const saved = await service.setBrandConceptSets(at(V15), [
          {
            brandName: '브랜드A',
            brandDescription: '',
            concepts: [],
            customOptions: [
              { axis: 'style', key: 'x:00000001', label: '같은이름', description: '먼저' },
              { axis: 'style', key: 'x:00000002', label: '같은이름', description: '나중' },
            ],
          },
        ]);
        // 한 축에 같은 이름 칩이 둘이면 사용자가 어느 것을 고른 것인지 구별 불가
        expect(saved[0].customOptions).toHaveLength(1);
        expect(saved[0].customOptions[0].description).toBe('나중');
      });

      /**
       * 상한을 가득 채운 세트. 레퍼런스는 두 축에 나눠 담고 이름은 서로 다르게
       * 한 축에 몰면 축당 상한이, 이름이 겹치면 중복 제거가 먼저 걸려 총량에 닿지 못함
       */
      const fullSet = (s: number) => ({
        brandName: `브랜드${s}`,
        brandDescription: 'x'.repeat(2000),
        concepts: [],
        customOptions: Array.from({ length: 40 }, (_, i) => ({
          axis: i % 2 === 0 ? 'style' : 'mood',
          key: `x:${i.toString(16).padStart(8, '0')}`,
          label: `${'l'.repeat(55)}${i}`,
          description: 'd'.repeat(200),
        })),
      });

      it('설정 전체가 저장 상한을 넘으면 거절한다', async () => {
        // 필드별 상한은 곱해짐(세트 수 x 레퍼런스 수 x 글자 수). 그 곱을 막는 것이 이 검증
        const bulky = Array.from({ length: 20 }, (_, s) => fullSet(s));
        await expect(service.setBrandConceptSets(at(V15), bulky)).rejects.toThrow(
          BadRequestException,
        );
      });

      it('상한 안에서는 최대치를 저장한다(상한이 정상 사용을 막지 않는다)', async () => {
        // 같은 모양에서 세트 수만 줄인다. 이만큼도 실사용보다 한참 크다.
        const heavy = Array.from({ length: 5 }, (_, s) => fullSet(s));
        const saved = await service.setBrandConceptSets(at(V15), heavy);
        expect(saved).toHaveLength(5);
        expect(saved[0].customOptions).toHaveLength(40);
      });
    });
  });

});
