import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { imageSizeFor } from '@csc/video-capabilities';
import { PlanGenerationService } from '../plan-generation.service';
import {
  PlanPromptAssembler,
  PLAN_GENERATORS,
  PLAN_PROMPT_ASSEMBLERS,
  PlanProcessViewBuilder,
  PLAN_PROCESS_VIEWS,
  PlanGeneratorPort,
  PlanGenerationContext,
  PlanGenerationResult,
  PlanGenerationUsage,
  PLAN_IMAGE_GENERATOR_PORT,
  PlanImageGeneratorPort,
  PlanImageContext,
  PlanImageResult,
  FOCUS_KEYWORD_GENERATOR_PORT,
  FocusKeywordGeneratorPort,
  FocusKeywordContext,
  BRIEF_REFINER_PORT,
  BriefRefinerPort,
  BriefRefinementContext,
  BriefRefinementResult,
  VideoModelPromptPort,
  VIDEO_MODEL_PROMPT_PORT,
} from '../../ports/outbound';
import type { VersionRegistry } from '../../../../../../shared/domain/version-registry';
import { pipelineFor } from '../../../../../../shared/domain/version-pipeline';
import {
  PLAN_PROMPT_ASSEMBLER_V10,
  PLAN_PROMPT_ASSEMBLER_V15,
} from '../../../domain/prompt';
import {
  FOCUS_KEYWORD_SUGGESTION_COUNT,
  MAX_SCENE_COUNT,
  PLAN_IMAGE_QUALITY,
  RefinedBrief,
  SEGMENT_LIMIT_EXCEEDED,
  segmentLimitMessage,
  stableSeed,
  VideoModelPromptDescriptor,
} from '../../../domain';
// v1.0 프롬프트 본문은 배럴이 재노출하지 않는다(한 버전의 어휘가 ambient 로 보이지 않게)
//   그 버전의 문안을 검사하는 케이스만 그 폴더를 직접 참조
import {
  DEFAULT_PLAN_INSTRUCTIONS,
  IMAGE_SAFETY_DIRECTIVE,
} from '../../../domain/prompt/v10/system';
import {
  PLAN_PROCESS_VIEW_V10,
  PLAN_PROCESS_VIEW_V15,
} from '../../../domain/process';
import {
  ActivityLogPort,
  ACTIVITY_LOG_PORT,
} from '../../../../../../shared/domain/activity-log';
import { createActivityLogMock } from '../../../../../../shared/domain/activity-log/__mocks__/activity-log.mock';
import { COMMON_ASSET_PORT } from '../../../../../common-asset/core/application/ports/inbound';
import { CommonAssetEntity } from '../../../../../common-asset/core/domain';
import { ChannelPort, CHANNEL_PORT } from '../../../../../channel/core/application/ports/inbound';
import { ChannelEntity } from '../../../../../channel/core/domain';
import { DEFAULT_TOOL_VERSION, TOOL_VERSIONS } from '../../../../../../shared/domain/tool-version';

/**
 * 버전별 조립기 레지스트리: 진짜 구현
 *
 * DI 배선과 아래 단정들이 같은 객체를 본다. 갈라 두면 "서비스는 A 를 쓰는데 검사는 B 를 기대" 하는
 * 상태가 생기고, 버전마다 프롬프트가 다른 지금은 특히 조용히 어긋남
 */
const ASSEMBLERS = {
  'v1.5': PLAN_PROMPT_ASSEMBLER_V15,
  'v1.0': PLAN_PROMPT_ASSEMBLER_V10,
} satisfies VersionRegistry<PlanPromptAssembler>;

/** 버전별 프로세스 뷰 빌더: 같은 이유로 진짜 구현 */
const PROCESS_VIEWS = {
  'v1.5': PLAN_PROCESS_VIEW_V15,
  'v1.0': PLAN_PROCESS_VIEW_V10,
} satisfies VersionRegistry<PlanProcessViewBuilder>;
import {
  ownerVersionScope,
  workspaceScope,
} from '../../../../../../shared/domain/workspace-scope';
import { ChannelSettingsService } from '../../../../../channel-settings/core/application/services';
import { resolveConceptText } from '../../../../../channel-settings/core/domain';
import { conceptLine } from '../../../domain/brand-concept';
import {
  ChannelSettingsPort,
  CHANNEL_SETTINGS_PORT,
} from '../../../../../channel-settings/core/application/ports/inbound';
import {
  ChannelSettingsRepositoryPort,
  CHANNEL_SETTINGS_REPOSITORY_PORT,
  ChannelSettingsRecord,
  DataCollectorPort,
  DATA_COLLECTOR_PORT,
  UserToolSettingsRecord,
  UserToolSettingsRepositoryPort,
  USER_TOOL_SETTINGS_REPOSITORY_PORT,
} from '../../../../../channel-settings/core/application/ports/outbound';

/**
 * 기획서 생성은 재료를 전부 다른 도메인에서 받는다(목적 키워드 = 단어, 브랜드/컨셉과 AI 모델과
 * 편집 지침과 소스 인사이트 = 채널 설정). 그래서 이 스펙은 그 둘을 실제 서비스로 조립해
 * 컨텍스트가 어떻게 만들어지는지 끝까지 확인한다. 가짜 포트로 바꾸면 조립 규칙이 아니라
 * 가짜의 반환값을 검증하게 됨
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

  // 기획 도메인이 쓰지 않는 계약(채널 CRUD)은 이 페이크의 관심사가 아님
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

/**
 * 후보 생성기 페이크: 씨앗을 프롬프트에서 읽어 고정 목록을 돌려준다(LLM 호출 없이 조립만 검증)
 *
 * 페이크가 컨텍스트 필드가 아니라 조립된 프롬프트만 받는다. 실제 모델이 보는 것과 같은 것을 보므로
 * 값이 프롬프트에 실리지 않으면 페이크도 그것을 볼 수 없음
 */
class FakeFocusKeywordGenerator implements FocusKeywordGeneratorPort {
  lastContext: FocusKeywordContext | null = null;
  // 호출 기록: 몇 번, 몇 개씩 요청했는지(목표를 채우는 재호출을 검증한다)
  calls: FocusKeywordContext[] = [];
  /** 보완 호출 실패 주입: 수집분만으로 진행하는 경로 검증 */
  failing = false;
  // 한 번에 돌려줄 개수(요청보다 적게 주는 모델 흉내). null 이면 요청한 만큼
  perCall: number | null = null;
  /** 새 말을 못 만드는 모델(같은 값만 반복): 재시도 상한에서 멈추는지 검증 */
  repeating = false;
  /** 형식을 어기는 모델(씨앗을 품지 않는 말): 서버가 걸러 내는지 검증 */
  malformed = false;
  private seq = 0;

  async suggest(context: FocusKeywordContext): Promise<string[]> {
    this.lastContext = context;
    this.calls.push(context);
    if (this.failing) throw new Error('보완 실패');
    const count = Math.min(this.perCall ?? context.needed, context.needed);
    const seed = seedOf(context.userPrompt);
    // 계약대로 씨앗을 품은 롱테일을 만든다(프롬프트가 요구하는 형태)
    if (this.malformed) return Array.from({ length: count }, () => `무관어${(this.seq += 1)}`);
    if (this.repeating) return Array.from({ length: count }, () => `${seed} 같은 말`);
    return Array.from({ length: count }, () => `${seed} 생성어${(this.seq += 1)}`);
  }
}

/**
 * 입력 정제기 페이크: 조립된 프롬프트를 받아 미리 정해 둔 정제본을 돌려준다(LLM 호출 없이)
 *
 * 기본 정제본은 동영상 하나다. 원문을 되풀이하지 않는 이유: 정제본이 기획 프롬프트에 실렸는지와
 * 원문이 실리지 않았는지를 한 검사에서 가르려면 둘이 달라야 한다.
 */
class FakeBriefRefiner implements BriefRefinerPort {
  lastContext: BriefRefinementContext | null = null;
  calls: BriefRefinementContext[] = [];
  /** 정제 실패 주입: 생성이 원문으로 조용히 진행하지 않는지 검증 */
  failing = false;
  usage: PlanGenerationUsage | null = null;
  result: RefinedBrief = {
    segments: [{ sceneComposition: '정제된 장면 구성', dialogue: '', narration: '' }],
    constraints: [],
    notes: [],
  };

  async refine(context: BriefRefinementContext): Promise<BriefRefinementResult> {
    this.lastContext = context;
    this.calls.push(context);
    if (this.failing) throw new InternalServerErrorException('정제 실패');
    return { refined: this.result, usage: this.usage };
  }
}

/** 줄 나누기: 조립기가 개행으로 세그먼트를 연결 */
const SPLIT_LINES = /\r?\n/;

/** 조립된 프롬프트에서 주제 한 줄을 읽는다(그 세그먼트가 `주제: ` 로 시작한다) */
function seedOf(userPrompt: string): string {
  return /^주제: (.+)$/m.exec(userPrompt)?.[1] ?? '';
}

/** 조립된 프롬프트에 실린 '이미 있는 후보' 목록. 없으면 빈 배열(그 세그먼트가 조건부다) */
/**
 * 카탈로그 옵션 하나가 프롬프트에 실릴 때의 정확한 줄
 *
 * 컨텍스트에서 `brand.concepts` 를 읽던 단정들이 이 헬퍼로 옮겨졌다. 생성 포트는 조립이 끝난
 * 프롬프트만 받으므로(재료를 두 번 넘기지 않는다), 서비스가 축 조합을 어떻게 풀었는지는 그
 * 프롬프트를 읽어야 알 수 있다. 형식을 여기서 다시 적지 않고 `conceptLine` 재사용
 */
function conceptTextLine(axis: string, option: string, axisLabel?: string): string {
  const text = resolveConceptText(axis, option);
  // 카탈로그에서 풀리지 않으면 여기서 죽는다. `conceptLine` 이 빈 문자열을 돌려주고 그것이
  //   `toContain('')` 에 들어가면 무엇이든 통과해 단정이 아무것도 지키지 않게 됨
  if (!text) throw new Error(`카탈로그에 없는 옵션이다: ${axis}/${option}`);
  return conceptLine({ axis, option, label: text.label, note: text.note, axisLabel });
}

function existingOf(userPrompt: string): string[] {
  const after = userPrompt.split('[이미 있는 후보]')[1];
  if (!after) return [];
  return after
    .split(SPLIT_LINES)
    .map((l) => /^- (.+)$/.exec(l.trim())?.[1])
    .filter((v): v is string => !!v);
}

class FakeDataCollector implements DataCollectorPort {
  // 키워드 원천 조회 기록: 어느 소스를 실제로 불렀는지(끈 소스는 아예 안 불러야 한다)
  poolCalls: string[] = [];
  adKeywords: { keyword: string; monthlySearches?: number }[] = [
    { keyword: '아기 발진 크림', monthlySearches: 5000 },
    { keyword: '기저귀 발진 연고', monthlySearches: 3000 },
  ];
  // 트렌드 소스는 씨앗과 무관한 인기어를 준다(롱테일 필터가 걸러야 한다)
  trends: string[] = ['전차', '아기 발진 병원'];
  nate: string[] = ['탄핵'];
  /**
   * 수집 서버가 주는 분야 선택지. 12개를 흉내내지 않는다. 검증할 사실은 개수가 아니라
   * "도구가 이 목록을 따라 부른다"는 것이라, 둘이면 충분하고 상수를 들면 그대로 깨진다.
   */
  categories = [
    { value: 'cid-1', label: '분야1' },
    { value: 'cid-2', label: '분야2' },
  ];
  periods = [
    { value: 'weekly', label: '주간', expected: 12 },
    { value: 'daily', label: '일간', expected: 12 },
  ];
  // cid 별 인기어. 분야를 가리지 않고 모으므로 씨앗과 무관한 말이 섞인다.
  shoppingInsight: Record<string, string[]> = {
    'cid-1': ['원피스', '아기 발진 물티슈'],
    'cid-2': ['원피스'], // 분야가 겹치는 말: 중복 제거 대상
  };
  /** 이 cid 는 아직 수집 중(빈 목록)으로 응답 */
  collectingCids = new Set<string>();

  async fetchAdKeywords(seed: string) {
    this.poolCalls.push(`ad:${seed}`);
    return { status: 'ok' as const, keywords: this.adKeywords };
  }
  async getSourceOptions(sourceId: string) {
    this.poolCalls.push(`options:${sourceId}`);
    return { sourceId, categories: this.categories, periods: this.periods };
  }
  async fetchShoppingInsight(cid: string, period: string) {
    this.poolCalls.push(`shopping:${cid}:${period}`);
    if (this.collectingCids.has(cid)) {
      return { status: 'collecting' as const, keywords: [] };
    }
    return {
      status: 'ok' as const,
      keywords: (this.shoppingInsight[cid] ?? []).map((keyword) => ({ keyword })),
    };
  }
  async fetchGoogleTrends(geo: string) {
    this.poolCalls.push(`trends:${geo}`);
    return { status: 'ok' as const, keywords: this.trends.map((keyword) => ({ keyword })) };
  }
  async fetchNateRealtime() {
    this.poolCalls.push('nate');
    return { status: 'ok' as const, keywords: this.nate.map((keyword) => ({ keyword })) };
  }
}

/** 미선택 AI 모델 선택(전 역량 빈 값). 부분 객체를 넘길 수 없어 스프레드 베이스로 사용 */
const EMPTY_AI_MODELS = {
  llm: '',
  video: '',
  videoMode: '',
  tts: '',
  ttsVoice: '',
  ttsPitch: '',
  image: '',
};

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

type FakeUserRow = {
  aiModels: string | null;
  brandConcepts: string | null;
  entryVersion: string;
  defaultChannelId: number | null;
};

/** 개인 도구 설정 인메모리 페이크((조직, 유저) 키): 모델 선택과 브랜드/컨셉이 한 행 */
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

class FakePlanGenerator implements PlanGeneratorPort {
  lastContext: PlanGenerationContext | null = null;
  // 주입 가능한 사용량: null 이면 구 버전 language-model(usage 미제공)을 대변
  usage: PlanGenerationUsage | null = null;
  async generate(context: PlanGenerationContext): Promise<PlanGenerationResult> {
    this.lastContext = context;
    return {
      proposals: [{ id: 'p1', title: 't', summary: 's', scenes: [], bgm: null }],
      usage: this.usage,
      estimatedOutputTokens: 1234,
    };
  }
}

class FakeCommonAsset {
  assets: CommonAssetEntity[] = [];
  async list(): Promise<CommonAssetEntity[]> {
    return this.assets;
  }
}

class FakePlanImageGenerator implements PlanImageGeneratorPort {
  lastContext: PlanImageContext | null = null;
  async generate(context: PlanImageContext): Promise<PlanImageResult> {
    this.lastContext = context;
    // usage=null: 자체 모델(토큰 과금 아님) 경로. 금액 계산은 모델 key 의 billing 담당
    return { b64: 'AAAA', mimeType: 'image/png', usage: null };
  }

  // 이 spec 이 쓰지 않는 계약. 페이크가 포트 전체를 구현해야 계약이 바뀔 때 여기서 걸림
  async engineLoad(): Promise<null> {
    throw new Error('not used');
  }
}

/**
 * VideoModelPromptPort 가짜: 프로세스 뷰가 원천 영상 프롬프트를 video-model 에서 받아 오는 경로
 * 기본은 null(조회 실패)로 두어 폴백 경로가 기본 검증되게 하고, 필요한 테스트만 값을 채운다.
 */
class FakeVideoModelPrompt implements VideoModelPromptPort {
  descriptor: VideoModelPromptDescriptor | null = null;
  calls = 0;
  async getPromptDescriptor(): Promise<VideoModelPromptDescriptor | null> {
    this.calls += 1;
    return this.descriptor;
  }
}

describe('PlanGenerationService', () => {
  const ORG = 1;
  /** 활동 원장의 행위자(조직 유저 id): 생성 계열은 '누가' 를 반드시 기록 */
  const OWNER = 7;
  /**
   * 스코프 헬퍼. `(ORG, OWNER[, channelId])` 인자 나열을 대체
   *
   * 버전이 스코프에 있는 것이 이 도메인의 계약이다: 프롬프트 조립 규칙과 모델 슬롯이 버전마다
   * 갈리므로, 어느 버전으로 만드는지가 요청의 일부다.
   */
  const ownerScope = (version = DEFAULT_TOOL_VERSION) =>
    ownerVersionScope({ organizationId: ORG, ownerUserId: OWNER, version });
  const planScope = (channelId: number, version = DEFAULT_TOOL_VERSION) =>
    workspaceScope({ organizationId: ORG, ownerUserId: OWNER, channelId, version });
  let service: PlanGenerationService;
  let settingsService: ChannelSettingsPort;
  let channels: FakeChannelPort;
  let dataCollector: FakeDataCollector;
  let settings: FakeChannelSettingsRepository;
  let userSettings: FakeUserToolSettingsRepository;
  let planGen: FakePlanGenerator;
  let planImageGen: FakePlanImageGenerator;
  let focusKeywords: FakeFocusKeywordGenerator;
  let briefRefiner: FakeBriefRefiner;
  let commonAssets: FakeCommonAsset;
  let videoModelPrompts: FakeVideoModelPrompt;
  let activityLog: jest.Mocked<ActivityLogPort>;

  beforeEach(async () => {
    channels = new FakeChannelPort();
    dataCollector = new FakeDataCollector();
    settings = new FakeChannelSettingsRepository();
    userSettings = new FakeUserToolSettingsRepository();
    planGen = new FakePlanGenerator();
    planImageGen = new FakePlanImageGenerator();
    focusKeywords = new FakeFocusKeywordGenerator();
    briefRefiner = new FakeBriefRefiner();
    commonAssets = new FakeCommonAsset();
    videoModelPrompts = new FakeVideoModelPrompt();
    activityLog = createActivityLogMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanGenerationService,
        { provide: CHANNEL_SETTINGS_PORT, useClass: ChannelSettingsService },
        { provide: CHANNEL_PORT, useValue: channels },
        { provide: CHANNEL_SETTINGS_REPOSITORY_PORT, useValue: settings },
        { provide: USER_TOOL_SETTINGS_REPOSITORY_PORT, useValue: userSettings },
        { provide: DATA_COLLECTOR_PORT, useValue: dataCollector },
        // 버전별 프롬프트 조립기: 진짜 구현을 넣는다. 조립 결과가 컨텍스트에 실려 나가는지가
        //   이 스펙의 관심사이므로 가짜로 바꾸면 그 연결이 검증에서 빠진다.
        { provide: PLAN_PROMPT_ASSEMBLERS, useValue: ASSEMBLERS },
        // 프로세스 뷰도 진짜 빌더를 꽂는다: 이 스펙의 프로세스 뷰 케이스는 서비스가 그
        //   버전의 빌더를 고르는지와 채널 상태를 넘기는지를 본다(서술 내용은 그 빌더의
        //   스펙이 잠근다)
        { provide: PLAN_PROCESS_VIEWS, useValue: PROCESS_VIEWS },
        // 컨텍스트 조립을 검증하는 가짜 생성기(LLM 어댑터 파싱은 어댑터 spec 에서 별도 검증)
        // 두 슬롯에 같은 가짜를 꽂는다: 이 스펙의 관심은 서비스가 컨텍스트를 어떻게 조립하는가이고,
        //   어느 버전이 어느 어댑터로 가는가는 모듈 배선의 관심이다(app.module.spec 이 지킨다)
        { provide: PLAN_GENERATORS, useValue: { 'v1.5': planGen, 'v1.0': planGen } },
        { provide: PLAN_IMAGE_GENERATOR_PORT, useValue: planImageGen },
        // 포커스 키워드 후보 생성기(LLM 호출 없이 컨텍스트 조립만 검증)
        { provide: FOCUS_KEYWORD_GENERATOR_PORT, useValue: focusKeywords },
        // 입력 정제기(LLM 호출 없이, 정제본이 기획 컨텍스트에 실리는지만 검증)
        { provide: BRIEF_REFINER_PORT, useValue: briefRefiner },
        // 기획 생성이 읽는 BGM/SFX 후보 풀
        { provide: COMMON_ASSET_PORT, useValue: commonAssets },
        // 프로세스 뷰가 원천 영상 프롬프트를 받아 오는 곳(원문 주인 = video-model)
        { provide: VIDEO_MODEL_PROMPT_PORT, useValue: videoModelPrompts },
        { provide: ACTIVITY_LOG_PORT, useValue: activityLog },
      ],
    }).compile();
    service = module.get(PlanGenerationService);
    settingsService = module.get(CHANNEL_SETTINGS_PORT);
  });

  /** 채널 하나를 준비한다(기획 컨텍스트는 전부 채널 스코프다) */
  function makeChannel(name = '유튜브'): ChannelEntity {
    return channels.seed(ORG, OWNER, name);
  }

  describe('generatePlans (키워드/브랜드 → 컨텍스트 조립 → 생성기 위임)', () => {
    /** 이번 생성의 목적 키워드: 저장하지 않으므로 호출자가 매번 전달 */
    const KEYWORDS = ['수분크림'];

    /**
     * 채널 하나 + 그 사람의 브랜드/컨셉 1세트 준비(목적 키워드는 요청에 실려 오므로 준비할 것이 없다)
     * 세트는 채널이 아니라 OWNER 에 부착. 채널을 몇 개 만들어도 같은 목록
     */
    /**
     * 개인 설정(브랜드/컨셉 세트)은 버전별로 저장된다. 이 블록은 두 버전을 모두 시험하므로
     * 양쪽에 같은 세트를 심는다. 한쪽만 심으면 그 버전 테스트가 브랜드를 못 찾아 NotFound 로 죽고,
     * 실패 지점이 정작 시험하려는 것과 무관해진다.
     */
    async function seedChannel(): Promise<{ channelId: number }> {
      const c = makeChannel('유튜브');
      const set = {
        brandName: '촉촉연구소',
        brandDescription: '보습 전문 브랜드',
        concepts: [
          { axis: 'style', option: 'live-action-closeup' },
          { axis: 'mood', option: 'warm-cozy' },
        ],
      };
      await settingsService.setBrandConceptSets(ownerScope('v1.5'), [set]);
      await settingsService.setBrandConceptSets(ownerScope('v1.0'), [set]);
      return { channelId: c.id };
    }

    it('없는 채널이면 NotFound 를 던져야 한다', async () => {
      await expect(service.generatePlans(planScope(999), '촉촉연구소', KEYWORDS, 5, 6)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('brandName 이 그 사람의 브랜드/컨셉에 없으면 NotFound 를 던져야 한다', async () => {
      const { channelId } = await seedChannel();
      await expect(service.generatePlans(planScope(channelId), '없는브랜드', KEYWORDS, 5, 6)).rejects.toThrow(
        NotFoundException,
      );
    });

    /**
     * 브랜드를 고르지 않는 입력 방식(프롬프트). 고르는 것이 하나도 없다: 주제도 연출도 작업자가
     * 적은 씬 입력 본문에서 나오고, 적히지 않은 것은 모델이 결정
     *
     * 그 경로가 세트를 조회하지 않는다는 것이 핵심이다. 조회하면 있지도 않은 이름으로 찾다가
     * NotFound 가 나서 그 방식 자체가 막힌다.
     */
    describe('브랜드 없이 생성(완전 자율)', () => {
      const BRIEF = '동영상1: 첫 장면';

      it('세트를 고르지 않아도 생성된다', async () => {
        const { channelId } = await seedChannel();
        await expect(
          service.generatePlans(planScope(channelId), '', [], 1, 3, false, undefined, BRIEF),
        ).resolves.toBeDefined();
      });

      it('브랜드 절과 연출 성격 절이 통째로 빠지고 씬 입력이 주제가 된다', async () => {
        // 빈 절을 남기면 모델이 채워야 할 빈자리로 읽는다. 그리고 무엇을 중심에 둘지 말해 주지
        //   않으면 모델이 그 자리를 스스로 지어내 적어 준 내용과 무관한 영상이 나옴
        const { channelId } = await seedChannel();
        await service.generatePlans(planScope(channelId), '', [], 1, 3, false, undefined, BRIEF);

        const user = planGen.lastContext!.userPrompt;
        expect(user).not.toContain('브랜드명:');
        expect(user).not.toContain('[연출 성격]');
        expect(user).toContain('[사용자 입력사항]');
        expect(user).toContain('위 사용자 입력사항을 그대로 중심으로');

        // 적히지 않은 연출을 모델이 정하라는 지시가 있어야 한다(없으면 매번 같은 톤으로 나온다)
        expect(planGen.lastContext!.systemPrompt).toContain('적히지 않은 것은 전부 네가 정한다');
      });

      it('브랜드명이 비어 있지 않으면 여전히 세트를 찾는다', async () => {
        // 빈 값만 새 경로다. 오타로 없는 이름이 오면 예전처럼 NotFound 여야 한다(조용히 브랜드 없는
        //   기획안을 만들면 사용자는 왜 주제가 다른지 알 수 없다)
        const { channelId } = await seedChannel();
        await expect(
          service.generatePlans(planScope(channelId), '없는브랜드', [], 1, 3),
        ).rejects.toThrow(NotFoundException);
      });
    });

    /**
     * 제한사항과 씬 입력은 화면에서 적은 것이 정제를 거쳐 그 버전의 유저 프롬프트에 닿아야 함
     *
     * 이 값이 지나는 길이 길다(생성 모달 → BFF → DTO → 서비스 → 정제기 → 그 버전 조립기). 중간 한
     * 곳이 빠뜨려도 화면은 그대로이고 결과 영상만 조용히 제한을 무시한다(BFF 구조분해 목록에서
     * 빠지면 중계되지 않는다). 그래서 버전별로 고정한다.
     *
     * 조립기 단위 테스트가 아니라 서비스에서 단정하는 이유: 모델이 실제로 받는 것이 서비스가
     * 조립해 넘긴 컨텍스트라, 그 자리에서 봐야 중간 하나가 빠진 것도 잡힌다.
     */
    it('v1.5 는 씬 입력과 제한사항을 정제기에 원문으로 넘기고, 유저 프롬프트에는 정제본을 싣는다', async () => {
      const { channelId } = await seedChannel();
      briefRefiner.result = {
        segments: [
          {
            sceneComposition: '목욕 후 로션을 바르는 손의 클로즈업',
            dialogue: '',
            narration: '목욕 후에도 남는 찝찝함',
          },
        ],
        constraints: ['아기 얼굴 클로즈업은 피한다'],
        notes: ['번호 표기 정리'],
      };
      await service.generatePlans(
        planScope(channelId, 'v1.5'),
        '촉촉연구소',
        KEYWORDS,
        1,
        3,
        false,
        undefined,
        '1. 목욕 후 로션 바르는 장면',
        '아기 얼굴 클로즈업은 피한다',
      );

      // 정제기는 원문을 받는다(그것이 정제할 대상이다). 모델은 파이프라인 표가 고정한 것
      const refinerUser = briefRefiner.lastContext!.userPrompt;
      expect(refinerUser).toContain('[사용자 입력사항]\n1. 목욕 후 로션 바르는 장면');
      expect(refinerUser).toContain('[제한사항]\n아기 얼굴 클로즈업은 피한다');
      expect(briefRefiner.lastContext!.model).toBe(pipelineFor('v1.5').briefRefinerLlm);

      // 기획 LLM 은 정제본을 받는다. 화면의 입력 예시와 같은 모양(동영상N + 세 항목)이고
      //   한 덩어리로 읽혀야 한다: "이렇게 만들되 이건 피하라". 순서가 흔들리면 제한이 다른 절의
      //   제한처럼 읽힌다.
      const user = planGen.lastContext!.userPrompt;
      expect(user).toContain(
        [
          '[사용자 입력사항]',
          '동영상1:',
          '장면 구성: 목욕 후 로션을 바르는 손의 클로즈업',
          '대화내용: 없음',
          '나레이션: 목욕 후에도 남는 찝찝함',
          '',
          '[제한사항]',
          '아기 얼굴 클로즈업은 피한다',
        ].join('\n'),
      );
      expect(user).not.toContain('1. 목욕 후 로션 바르는 장면');
    });

    /**
     * 입력 정제(기획 앞). 사람은 이 칸에 무엇이든 적고(시간 구간, 단계 태그, 따로 모은 나레이션)
     * 파이프라인은 그중 어느 것도 받지 않는다. 그 변환이 기획 LLM 앞의 별도 호출이라는 것,
     * 그리고 그 호출이 언제 나가고 실패하면 어떻게 되는지가 여기의 계약이다.
     */
    describe('입력 정제(기획 앞)', () => {
      it('정제가 확정한 동영상 수가 요청의 씬 수를 이긴다 [v1.5]', async () => {
        // 화면의 셈은 번호 표기에 의존한 어림값이다. "동영상1 (0-8초)" 처럼 적으면 세지 못해 기본값
        //   1 을 보내는데, 그대로 쓰면 프롬프트가 "정확히 1개" 라 말하면서 원문에는 넷이 적혀 있다.
        const { channelId } = await seedChannel();
        briefRefiner.result = {
          segments: [1, 2, 3].map((i) => ({ sceneComposition: `장면 ${i}`, dialogue: '', narration: '' })),
          constraints: [],
          notes: [],
        };
        await service.generatePlans(
          planScope(channelId, 'v1.5'), '촉촉연구소', KEYWORDS, 1, 1, false, undefined, '동영상1 (0-8초) 욕조\n동영상2 (8-16초) 제품\n동영상3 (16-24초) 아기',
        );
        expect(planGen.lastContext!.sceneCount).toBe(3);
        expect(planGen.lastContext!.systemPrompt).toContain('정확히 3개의 동영상');
      });

      it('두 칸이 모두 비면 정제기를 부르지 않는다 [v1.5]', async () => {
        // 유료 호출이다. 정제할 것이 없는데 부르면 돈만 나간다.
        const { channelId } = await seedChannel();
        await service.generatePlans(planScope(channelId, 'v1.5'), '촉촉연구소', KEYWORDS, 1, 3, false, undefined, '  ', '');
        expect(briefRefiner.calls).toHaveLength(0);
        expect(planGen.lastContext!.sceneCount).toBe(3);
      });

      it('정제하지 않는 버전은 원문을 그대로 싣고 정제기를 부르지 않는다 [v1.0]', async () => {
        // 그 버전에는 직접 적는 칸이 없다. 판정의 주인은 파이프라인 표(briefRefinerLlm === null)
        const { channelId } = await seedChannel();
        await service.generatePlans(
          planScope(channelId, 'v1.0'), '촉촉연구소', KEYWORDS, 1, 3, false, undefined, '씬1: 목욕 후 장면', '실사 질감 유지',
        );
        expect(briefRefiner.calls).toHaveLength(0);
        const user = planGen.lastContext!.userPrompt;
        expect(user).toContain('[사용자 입력사항]\n씬1: 목욕 후 장면');
        expect(user).toContain('[제한사항]\n실사 질감 유지');
      });

      it('제한사항만 적어도 정제한다: 동영상은 없고 제한만 정제본으로 실린다 [v1.5]', async () => {
        // 브리프가 없으면 동영상도 없어야 한다. 모델이 제한사항에서 동영상을 지어냈어도 버린다.
        const { channelId } = await seedChannel();
        briefRefiner.result = {
          segments: [{ sceneComposition: '지어낸 장면', dialogue: '', narration: '' }],
          constraints: ['아이 얼굴 클로즈업 금지', '실사 질감 유지'],
          notes: [],
        };
        await service.generatePlans(
          planScope(channelId, 'v1.5'), '촉촉연구소', KEYWORDS, 1, 2, false, undefined, '', '아이 얼굴 클로즈업 금지, 실사 질감 유지',
        );
        expect(briefRefiner.calls).toHaveLength(1);
        const user = planGen.lastContext!.userPrompt;
        expect(user).not.toContain('[사용자 입력사항]');
        expect(user).toContain('[제한사항]\n아이 얼굴 클로즈업 금지\n실사 질감 유지');
        // 씬 수는 요청값 그대로(정제가 동영상 단위를 확정한 것이 아니다)
        expect(planGen.lastContext!.sceneCount).toBe(2);
      });

      it('정제 결과가 동영상 상한을 넘으면 합치지 않고 400 과 코드로 거절한다 [v1.5]', async () => {
        // 합쳐서 맞추면 작업자가 나눈 단위가 말없이 바뀐다. 코드가 있어야 화면이 사유를 알리고 배치를
        //   걷을 수 있다(재시도해도 같은 실패라 사람이 입력을 고쳐야 한다). 그리고 이미 돈이 나간
        //   호출이라 원장에는 거절로 남는다.
        const { channelId } = await seedChannel();
        briefRefiner.result = {
          segments: Array.from({ length: MAX_SCENE_COUNT + 2 }, (_, i) => ({
            sceneComposition: `장면 ${i + 1}`,
            dialogue: '',
            narration: '',
          })),
          constraints: [],
          notes: [],
        };
        activityLog.log.mockClear();

        const call = service.generatePlans(
          planScope(channelId, 'v1.5'), '촉촉연구소', KEYWORDS, 1, 3, false, undefined, '동영상 열 개',
        );
        await expect(call).rejects.toThrow(BadRequestException);
        const body = await call.catch((e: BadRequestException) => e.getResponse()) as Record<string, unknown>;
        expect(body.code).toBe(SEGMENT_LIMIT_EXCEEDED);
        expect(body.error).toBe(segmentLimitMessage(MAX_SCENE_COUNT + 2));

        expect(planGen.lastContext).toBeNull();
        expect(activityLog.log).toHaveBeenCalledTimes(1);
        const entry = activityLog.log.mock.calls[0][0];
        expect(entry).toMatchObject({ action: 'plan.brief_refined', failed: true });
        // 원장 한 줄에 사유가 남아야 한다. 객체 본문으로 만든 Nest 예외의 message 는
        //   "Bad Request Exception" 이라 그것을 적으면 왜 거절됐는지 남지 않는다.
        expect(entry.message).toContain(segmentLimitMessage(MAX_SCENE_COUNT + 2));
      });

      it('브리프를 적었는데 정제 결과에 동영상이 없으면 실패한다 [v1.5]', async () => {
        // 빈 정제본을 넘기면 기획 LLM 이 사용자 입력사항 없는 프롬프트를 받아 적은 것과 무관한
        //   영상을 만든다. 그 실패는 결과물을 봐야 드러나므로 여기서 멈춘다.
        const { channelId } = await seedChannel();
        briefRefiner.result = { segments: [], constraints: [], notes: [] };
        await expect(
          service.generatePlans(planScope(channelId, 'v1.5'), '촉촉연구소', KEYWORDS, 1, 3, false, undefined, '동영상1: 욕조'),
        ).rejects.toThrow(InternalServerErrorException);
        expect(planGen.lastContext).toBeNull();
      });

      it('정제가 실패하면 생성을 멈춘다(원문으로 조용히 진행하지 않는다) [v1.5]', async () => {
        // 원문으로 진행하면 정제가 없던 때의 결과가 아무 신호 없이 나온다. 그것이 정제를 둔 이유다.
        const { channelId } = await seedChannel();
        briefRefiner.failing = true;
        await expect(
          service.generatePlans(planScope(channelId, 'v1.5'), '촉촉연구소', KEYWORDS, 1, 3, false, undefined, '동영상1: 욕조'),
        ).rejects.toThrow(InternalServerErrorException);
        expect(planGen.lastContext).toBeNull();
      });

      it('없는 브랜드면 정제기를 부르기 전에 실패한다 [v1.5]', async () => {
        // 요청 자체가 틀린 경우에 유료 호출이 먼저 나가면 안 된다.
        const { channelId } = await seedChannel();
        await expect(
          service.generatePlans(planScope(channelId, 'v1.5'), '없는브랜드', KEYWORDS, 1, 3, false, undefined, '동영상1: 욕조'),
        ).rejects.toThrow(NotFoundException);
        expect(briefRefiner.calls).toHaveLength(0);
      });

      it('[활동 로그] 정제를 별도 활동으로 기록한다: 원문과 정제본, 비용이 남는다 [v1.5]', async () => {
        // 유료 호출이라 원장에 자기 행이 있어야 금액이 맞고, "왜 내 지시가 이렇게 바뀌었나" 의
        //   답(원문 옆의 정제본)이 그 행에 있어야 한다.
        const { channelId } = await seedChannel();
        briefRefiner.result = {
          segments: [{ sceneComposition: '욕조', dialogue: '', narration: '' }],
          constraints: ['금지 하나'],
          notes: ['시간 표기 제거'],
        };
        briefRefiner.usage = { model: 'claude-sonnet-5', inputTokens: 1_000, outputTokens: 500 };
        activityLog.log.mockClear();

        await service.generatePlans(
          planScope(channelId, 'v1.5'), '촉촉연구소', KEYWORDS, 1, 3, false, undefined, '동영상1 (0-8초): 욕조', '금지 하나',
        );

        expect(activityLog.log).toHaveBeenCalledTimes(2);
        const [refineEntry, planEntry] = activityLog.log.mock.calls.map((c) => c[0]);
        expect(refineEntry).toMatchObject({
          organizationId: ORG,
          actorUserId: OWNER,
          channelId,
          version: 'v1.5',
          action: 'plan.brief_refined',
        });
        expect(refineEntry.usage).toEqual({ tokenInput: 1_000, tokenOutput: 500 });
        expect(refineEntry.cost).toMatchObject({ status: 'computed', model: 'claude-sonnet-5' });
        expect(refineEntry.detail).toMatchObject({
          segment_count: 1,
          raw_scene_brief: '동영상1 (0-8초): 욕조',
          raw_constraints: '금지 하나',
          refined_constraints: '금지 하나',
          notes: ['시간 표기 제거'],
        });
        expect(refineEntry.detail!.refined_scene_brief).toContain('동영상1:\n장면 구성: 욕조');
        // 기획 행은 정제를 거쳤다는 표시를 갖는다(두 행을 이어 읽는 근거)
        expect(planEntry).toMatchObject({ action: 'plan.generated' });
        expect(planEntry.detail).toMatchObject({ brief_refined: true, scene_count: 1 });
      });
    });

    it('v1.5 에서 제한사항을 적지 않으면 그 절 자체가 빠진다', async () => {
      // 빈 절을 남기면 모델이 채워야 할 빈자리로 읽는다(이 파일의 브랜드 절과 같은 이유)
      const { channelId } = await seedChannel();
      await service.generatePlans(
        planScope(channelId, 'v1.5'), '촉촉연구소', KEYWORDS, 1, 3, false, undefined, '씬 하나', '',
      );

      expect(planGen.lastContext!.userPrompt).not.toContain('[제한사항]');
    });

    it('v1.5 시스템 프롬프트가 두 필드를 요구하고 동영상마다 하나만 쓰게 한다', async () => {
      // 스키마에는 둘 다 있어야 한다(작업자가 어느 쪽이든 적을 수 있다). 다만 한 동영상이 둘 다
      //   가지면 10초 안에서 두 문장이 잘리므로 배타로 고정하고, 둘 다 오면 대화내용 유지
      const { channelId } = await seedChannel();
      await service.generatePlans(
        planScope(channelId, 'v1.5'), '촉촉연구소', KEYWORDS, 1, 3, false, undefined, '', '',
      );
      const prompt = planGen.lastContext!.systemPrompt;

      expect(prompt).toContain('"dialogue"');
      expect(prompt).toContain('"narration"');
      expect(prompt).toContain('대화내용과 나레이션 중 하나다');
      expect(prompt).toContain('둘 다 적혀 있으면 대화내용만 살리고');
    });

    it('채널이 달라도 같은 사람은 같은 세트를 쓴다', async () => {
      // 세트가 개인 스코프라는 사실은 채널이 아직 인자로 남아 있는 이 경로에서만 증명 가능
      const { channelId } = await seedChannel();
      const other = makeChannel('인스타그램');

      await service.generatePlans(planScope(channelId), '촉촉연구소', KEYWORDS, 5, 6);
      const first = planGen.lastContext!.userPrompt;
      await service.generatePlans(planScope(other.id), '촉촉연구소', KEYWORDS, 5, 6);
      const second = planGen.lastContext!.userPrompt;

      // 채널만 갈림. 세트에서 온 브랜드와 축 조합은 두 프롬프트에 같은 줄로 삽입
      expect(first).toContain('채널: 유튜브');
      expect(second).toContain('채널: 인스타그램');
      for (const line of [
        '브랜드명: 촉촉연구소',
        conceptTextLine('style', 'live-action-closeup'),
        conceptTextLine('mood', 'warm-cozy'),
      ]) {
        expect(first).toContain(line);
        expect(second).toContain(line);
      }
    });

    it('다른 사람의 세트로는 만들 수 없다', async () => {
      const { channelId } = await seedChannel();
      await expect(
        service.generatePlans(
          workspaceScope({
            organizationId: ORG,
            ownerUserId: OWNER + 1,
            channelId,
            version: DEFAULT_TOOL_VERSION,
          }),
          '촉촉연구소',
          KEYWORDS,
          5,
          6,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('브랜드/목적 키워드/조직 id 를 컨텍스트로 조립해 생성기에 넘긴다', async () => {
      const { channelId } = await seedChannel();
      const result = await service.generatePlans(planScope(channelId), '촉촉연구소', KEYWORDS, 5, 6);

      // 생성기 반환값을 그대로 반환
      expect(result.proposals).toEqual([{ id: 'p1', title: 't', summary: 's', scenes: [], bgm: null }]);
      // 그리고 실제로 부른 모델을 함께 반환. 저장이 그것을 되돌려 주면 그대로 굳음
      expect(result.llmModel).toBe(planGen.lastContext!.model);
      const ctx = planGen.lastContext!;
      expect(ctx.organizationId).toBe(ORG);
      // 고른 옵션(axis/option)이 저장→로드→프롬프트로 흐르고, 그 문구는 카탈로그가 결정
      //   재료가 아니라 조립 결과를 보는 이유: 모델이 실제로 받는 것이 그것이기 때문
      expect(ctx.userPrompt).toContain('채널: 유튜브');
      expect(ctx.userPrompt).toContain('브랜드명: 촉촉연구소');
      expect(ctx.userPrompt).toContain('브랜드 설명: 보습 전문 브랜드');
      expect(ctx.userPrompt).toContain(conceptTextLine('style', 'live-action-closeup'));
      expect(ctx.userPrompt).toContain(conceptTextLine('mood', 'warm-cozy'));
      expect(ctx.userPrompt).toContain('[목적 키워드]');
      expect(ctx.userPrompt).toContain('수분크림');
    });

    // 버전을 명시한다. 이 스코프 헬퍼의 기본값은 DEFAULT_TOOL_VERSION(= v1.5)이라, 버전을
    //   적지 않은 케이스는 버전 중립처럼 보이면서 실은 v1.5 를 돈다. 효과음 후보는 씬에 효과음
    //   자리가 있는 버전의 것이므로 그 버전으로 고정
    it('조직 에셋 풀에서 BGM/SFX 만 골라 후보로 넘긴다(SAMPLE_IMAGE 제외, tags 매핑) [v1.0]', async () => {
      const { channelId } = await seedChannel();
      commonAssets.assets = [
        { id: 1, category: 'SAMPLE_IMAGE', scope: 'organization', organizationId: ORG, packId: null, uploadId: 'u1', name: '샘플', mimeType: 'image/png', sizeBytes: 1, sortOrder: 1, tags: [] },
        { id: 2, category: 'BGM', scope: 'common', organizationId: null, packId: null, uploadId: 'u2', name: '잔잔', mimeType: 'audio/mp3', sizeBytes: 1, sortOrder: 1, tags: [{ tagId: 5, axisKey: 'mood', value: 'calm', label: '잔잔한', scope: 'common' }] },
        { id: 3, category: 'SFX', scope: 'organization', organizationId: ORG, packId: null, uploadId: 'u3', name: '휙', mimeType: 'audio/mp3', sizeBytes: 1, sortOrder: 1, tags: [{ tagId: 9, axisKey: 'type', value: 'whoosh', label: '휙', scope: 'organization' }] },
      ] as CommonAssetEntity[];

      await service.generatePlans(planScope(channelId, 'v1.0'), '촉촉연구소', KEYWORDS, 5, 6);
      const ctx = planGen.lastContext!;
      expect(ctx.bgmCandidates).toEqual([
        { id: 2, name: '잔잔', uploadId: 'u2', tags: [{ axisKey: 'mood', value: 'calm' }] },
      ]);
      expect(ctx.sfxCandidates).toEqual([
        { id: 3, name: '휙', uploadId: 'u3', tags: [{ axisKey: 'type', value: 'whoosh' }] },
      ]);
    });

    it('효과음 자리가 없는 버전에는 후보를 만들지도 보여주지도 않는다 [v1.5]', async () => {
      // 부재가 곧 사실이다. 빈 배열로 넘기면 "후보가 하나도 없는 조직" 과 구분되지 않고, 읽는 쪽은
      //   그 버전이 효과음을 배치할 수도 있다고 읽는다. 판정의 주인은 프롬프트 조립기다.
      //   (offersSceneSfx): 후보를 제시하지 않은 프롬프트의 응답에는 그 id 가 올 수 없음
      const { channelId } = await seedChannel();
      commonAssets.assets = [
        { id: 2, category: 'BGM', scope: 'common', organizationId: null, packId: null, uploadId: 'u2', name: '잔잔', mimeType: 'audio/mp3', sizeBytes: 1, sortOrder: 1, tags: [] },
        { id: 3, category: 'SFX', scope: 'organization', organizationId: ORG, packId: null, uploadId: 'u3', name: '휙소리', mimeType: 'audio/mp3', sizeBytes: 1, sortOrder: 1, tags: [] },
      ] as CommonAssetEntity[];

      await service.generatePlans(planScope(channelId, 'v1.5'), '촉촉연구소', KEYWORDS, 1, 3);
      const ctx = planGen.lastContext!;

      expect(ctx).not.toHaveProperty('sfxCandidates');
      // BGM 은 그 버전도 사용. 절반만 걷어야 함
      expect(ctx.bgmCandidates).toEqual([
        { id: 2, name: '잔잔', uploadId: 'u2', tags: [] },
      ]);
      // 프롬프트에도 없음. 모델은 보여주지 않은 것을 고를 수 없기 때문
      expect(ctx.userPrompt).not.toContain('휙소리');
      expect(ctx.userPrompt).toContain('잔잔');
    });

    it('에셋 조회가 실패해도 생성은 진행한다(후보는 빈 배열) [v1.0]', async () => {
      const { channelId } = await seedChannel();
      commonAssets.list = async () => {
        throw new Error('asset service down');
      };
      await service.generatePlans(planScope(channelId, 'v1.0'), '촉촉연구소', KEYWORDS, 5, 6);
      expect(planGen.lastContext!.bgmCandidates).toEqual([]);
      expect(planGen.lastContext!.sfxCandidates).toEqual([]);
    });

    // 기획안 개수를 고르는 버전으로 못박는다. 고정하는 버전은 요청값을 따르지 않으므로
    //   "고른 값이 그대로 간다" 를 그 버전으로 검사하면 검사의 뜻이 사라진다.
    it('선택한 기획안/씬 개수를 컨텍스트로 전달하고, 범위 밖 값은 clamp 한다 [v1.0]', async () => {
      const { channelId } = await seedChannel();
      // 범위 내 값은 그대로 전달
      await service.generatePlans(planScope(channelId, 'v1.0'), '촉촉연구소', KEYWORDS, 3, 7);
      expect(planGen.lastContext!.proposalCount).toBe(3);
      expect(planGen.lastContext!.sceneCount).toBe(7);
      // 범위 초과(기획안 max 6, 씬 max 8)는 상한으로 clamp.
      await service.generatePlans(planScope(channelId, 'v1.0'), '촉촉연구소', KEYWORDS, 999, 999);
      expect(planGen.lastContext!.proposalCount).toBe(6);
      expect(planGen.lastContext!.sceneCount).toBe(8);
    });

    it('기획안 수를 고정하는 버전은 요청이 무엇이든 그 수로 만든다 [v1.5]', async () => {
      // 화면에는 개수를 고를 자리가 없다. 그런데 서버가 요청값을 그대로 쓰던 동안, 낡은 탭이나
      //   직접 호출이 6을 보내면 프롬프트는 "배열의 항목은 정확히 1개다" 라고 말하는데 출력 토큰
      //   예산은 여섯 배로 잡히고 파서는 여섯 개를 잘라내려 한다. 그 요금은 실제로 나감
      const { channelId } = await seedChannel();

      for (const requested of [6, 3, 999]) {
        await service.generatePlans(
          planScope(channelId, 'v1.5'),
          '촉촉연구소',
          KEYWORDS,
          requested,
          4,
        );
        expect(planGen.lastContext!.proposalCount).toBe(1);
      }
      // 씬(세그먼트) 수는 고정이 아님. 브리프에서 파생된 값이 그대로 전달
      expect(planGen.lastContext!.sceneCount).toBe(4);
    });

    it('고른 이미지 모델이 그 벤더의 연출 안전 제약으로 프롬프트에 닿는다 [v1.0]', async () => {
      // 도달지에서 검사한다. 이 값이 가는 곳은 시스템 프롬프트 하나뿐이라 검사도 값이 실제로
      //   쓰이는 자리에 둔다(끊기면 제약이 조용히 사라진다)
      const { channelId } = await seedChannel();
      await settingsService.setAiModels(ownerScope('v1.0'), { ...EMPTY_AI_MODELS, image: 'gpt-image-2' });

      await service.generatePlans(planScope(channelId, 'v1.0'), '촉촉연구소', KEYWORDS, 2, 4);

      // gpt-image 계열만 붙는 제약이다(resolveImageSafetyDirective). 문안을 손으로 적지 않고
      //   그 상수를 그대로 대조. 문구가 바뀌어도 이 검사는 계속 유효해야 함
      expect(planGen.lastContext!.systemPrompt).toContain(IMAGE_SAFETY_DIRECTIVE);
    });

    // 씬 이미지를 만들지 않는 버전의 마스킹은 프롬프트로 검사할 수 없다. 그 버전의 세그먼트
    //   배열에는 안전 제약 자리가 애초에 없어, 마스킹이 깨져도 프롬프트가 똑같이 보인다.
    //   그래서 그 규칙은 규칙으로 검사한다: shared/domain/__tests__/version-pipeline.spec.ts

    // 인포그래픽은 이 버전의 산출물에만 있는 것이라 그 버전으로 고정
    it('인포그래픽 배제가 프롬프트의 출력 스키마를 바꾼다(기본은 배제하지 않는다) [v1.0]', async () => {
      const { channelId } = await seedChannel();
      // 기본(미지정): 스키마에 인포그래픽 자리 있음
      await service.generatePlans(planScope(channelId, 'v1.0'), '촉촉연구소', KEYWORDS, 5, 6);
      expect(planGen.lastContext!.systemPrompt).toContain('infographic');
      // 지정: 그 자리가 사라지고 배제 지시 추가
      await service.generatePlans(planScope(channelId, 'v1.0'), '촉촉연구소', KEYWORDS, 5, 6, true);
      const prompt = planGen.lastContext!.systemPrompt;
      expect(prompt).not.toContain('"infographic"');
      expect(prompt).toContain('인포그래픽');
    });

    it.each(TOOL_VERSIONS)(
      '편집 지침 미설정이면 **그 버전의** 기본 지침을 컨텍스트로 넘긴다 (%s)',
      async (version) => {
        // 기본 지침은 그 버전 출력 형식을 전제로 쓰인 문장이다. 한 버전의 것을 모든 버전에 넘기면
        //   없는 필드를 만들라는 지시가 나간다(그 사실은 결과물을 봐야 드러난다)
        const { channelId } = await seedChannel();
        await service.generatePlans(planScope(channelId, version), '촉촉연구소', KEYWORDS, 5, 6);
        expect(planGen.lastContext!.systemPrompt).toContain(
          ASSEMBLERS[version].defaultInstructions,
        );
      },
    );

    it('작업자가 편집한 지침이 그 생성의 프롬프트에 반영된다', async () => {
      const { channelId } = await seedChannel();
      await service.setPlanPrompt(planScope(channelId), '무조건 유머러스하게');
      await service.generatePlans(planScope(channelId), '촉촉연구소', KEYWORDS, 5, 6);
      expect(planGen.lastContext!.systemPrompt).toContain('무조건 유머러스하게');
    });

    it('목적 키워드가 없어도 생성한다: 컨텍스트에 빈 배열이 실린다', async () => {
      // 무엇을 다룰지 아직 정하지 않았을 때 브랜드만 골라 뽑는 것이 정상 경로다. 그때 프롬프트는
      //   브랜드를 주제로 삼는다(plan-prompt/plan-user-prompt 의 주제 지시가 갈린다)
      const { channelId } = await seedChannel();
      const { proposals } = await service.generatePlans(planScope(channelId), '촉촉연구소', [], 5, 6);

      expect(proposals.length).toBeGreaterThan(0);
      // 키워드 절 자체가 빠진다(빈 칸을 보여 주면 모델이 채워야 할 자리로 읽는다)
      expect(planGen.lastContext!.userPrompt).not.toContain('[목적 키워드]');
      // 브랜드는 그대로 실린다: 키워드가 빠진 자리를 브랜드가 메운다.
      expect(planGen.lastContext!.userPrompt).toContain('브랜드명: 촉촉연구소');
    });

    it('빈 문자열만 보낸 키워드는 없는 것과 같게 취급한다', async () => {
      // 화면에서 지운 흔적(공백)이 남아 오면 '키워드 있음' 으로 읽혀 주제 지시가 잘못 갈림
      const { channelId } = await seedChannel();
      await service.generatePlans(planScope(channelId), '촉촉연구소', ['  ', ''], 5, 6);
      expect(planGen.lastContext!.userPrompt).not.toContain('[목적 키워드]');
    });
    it('요청이 준 축 조합이 세트 조합을 덮고, 세트 자체는 그대로 남는다', async () => {
      const { channelId } = await seedChannel();
      await service.generatePlans(planScope(channelId), '촉촉연구소', KEYWORDS, 5, 6, false, [
        { axis: 'mood', option: 'bright-vivid' },
      ]);

      // 이번 생성에는 요청 조합이 실린다. 축 하나만 보내면 그 축만 남는다(세트 조합과 병합하지 않는다):
      //   병합하면 작업자가 화면에서 본 조합과 모델이 받은 조합이 달라진다.
      const overridden = planGen.lastContext!.userPrompt;
      expect(overridden).toContain(conceptTextLine('mood', 'bright-vivid'));
      expect(overridden).not.toContain(conceptTextLine('mood', 'warm-cozy'));
      expect(overridden).not.toContain(conceptTextLine('style', 'live-action-closeup'));
      // 브랜드 이름과 설명은 세트의 것을 그대로 쓴다(무엇을 만드는가는 바뀌지 않았다)
      expect(overridden).toContain('브랜드명: 촉촉연구소');

      // 세트는 손대지 않음. 다음 생성은 다시 세트 조합에서 시작
      const sets = await settingsService.getBrandConceptSets(ownerScope());
      expect(sets[0].concepts.map((c) => c.option)).toEqual(['live-action-closeup', 'warm-cozy']);
      await service.generatePlans(planScope(channelId), '촉촉연구소', KEYWORDS, 5, 6);
      const fromSet = planGen.lastContext!.userPrompt;
      expect(fromSet).toContain(conceptTextLine('style', 'live-action-closeup'));
      expect(fromSet).toContain(conceptTextLine('mood', 'warm-cozy'));
      expect(fromSet).not.toContain(conceptTextLine('mood', 'bright-vivid'));
    });

    it('같은 축이 두 번 오면 뒤에 온 것만 남는다(상반된 지시가 함께 실리지 않는다)', async () => {
      const { channelId } = await seedChannel();
      await service.generatePlans(planScope(channelId), '촉촉연구소', KEYWORDS, 5, 6, false, [
        { axis: 'mood', option: 'warm-cozy' },
        { axis: 'mood', option: 'bright-vivid' },
      ]);
      expect(planGen.lastContext!.userPrompt).toContain(conceptTextLine('mood', 'bright-vivid'));
      expect(planGen.lastContext!.userPrompt).not.toContain(conceptTextLine('mood', 'warm-cozy'));
    });

    it('카탈로그에 없는 축/옵션이면 BadRequest 를 던진다(빈 문구가 프롬프트에 실리지 않는다)', async () => {
      const { channelId } = await seedChannel();
      await expect(
        service.generatePlans(planScope(channelId), '촉촉연구소', KEYWORDS, 5, 6, false, [
          { axis: 'mood', option: '없는옵션' },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    describe('세트가 더한 카테고리로 생성하기', () => {
      const AXIS = 'x:1a2b3c4d';
      const OPT = 'x:9f8e7d6c';

      /** 커스텀 카테고리를 가진 세트로 채널 준비 */
      async function seedChannelWithCustomAxis(): Promise<{ channelId: number }> {
        const c = makeChannel('유튜브');
        await settingsService.setBrandConceptSets(ownerScope(), [
          {
            brandName: '촉촉연구소',
            brandDescription: '보습 전문 브랜드',
            concepts: [{ axis: AXIS, option: OPT }],
            customAxes: [{ key: AXIS, label: '계절감' }],
            customOptions: [
              { axis: AXIS, key: OPT, label: '오션 무드', description: '파스텔톤 바닷가' },
            ],
          },
        ]);
        return { channelId: c.id };
      }

      it('커스텀 축을 고른 세트로도 생성되고, 축 이름이 프롬프트에 들어간다', async () => {
        // 위저드는 세트 조합을 override 로 그대로 보낸다. 그 검증이 카탈로그만 보면 여기서 400 이
        //   나고, 설정에서 고른 연출로는 기획서를 뽑을 수 없게 됨
        const { channelId } = await seedChannelWithCustomAxis();
        await service.generatePlans(planScope(channelId), '촉촉연구소', KEYWORDS, 5, 6, false, [
          { axis: AXIS, option: OPT },
        ]);

        // 축 이름과 옵션 이름이 그 세트의 정의에서 풀려 프롬프트에 삽입
        //   해석이 빠지면 축 이름 자리에 raw key(`x:1a2b3c4d`)가 나감
        const user = planGen.lastContext!.userPrompt;
        expect(user).toContain('계절감: 오션 무드');
        expect(user).not.toContain(AXIS);
      });

      it('없어진 커스텀 선택은 그 항목만 건너뛴다(옛 기획안의 재생성이 막히지 않는다)', async () => {
        // 저장된 기획안은 생성 당시 조합을 스냅샷으로 갖고 재생성 때 다시 보낸다. 그 사이 사용자가
        //   카테고리를 지웠다고 세우면 그 기획안의 이미지 재생성이 영구히 400
        const { channelId } = await seedChannelWithCustomAxis();
        // 카테고리 관리에서 그 카테고리를 지운 상태(세트 단건 경로가 그 화면의 저장이다)
        await settingsService.setBrandConceptSetDetail(ownerScope(), '촉촉연구소', {
          customAxes: [],
          customOptions: [],
          concepts: [],
        });

        await service.generatePlans(planScope(channelId), '촉촉연구소', KEYWORDS, 5, 6, false, [
          { axis: AXIS, option: OPT },
          { axis: 'mood', option: 'bright-vivid' },
        ]);

        // 없어진 커스텀만 빠지고 남은 축은 그대로 유지
        const user = planGen.lastContext!.userPrompt;
        expect(user).toContain(conceptTextLine('mood', 'bright-vivid'));
        expect(user).not.toContain('오션 무드');
      });
    });

    it('[활동 로그] 기획서 생성을 행위자와 함께 기록한다. 가장 비싼 동작이라 귀속이 필수다', async () => {
      const { channelId } = await seedChannel();
      activityLog.log.mockClear(); // 준비 과정(채널/키워드 생성)의 호출을 배제

      await service.generatePlans(planScope(channelId), '촉촉연구소', KEYWORDS, 5, 6);

      expect(activityLog.log).toHaveBeenCalledTimes(1);
      const entry = activityLog.log.mock.calls[0][0];
      expect(entry).toMatchObject({
        organizationId: ORG,
        actorUserId: OWNER,
        channelId,
        action: 'plan.generated',
      });
      // 동기 호출이라 소요 시간이 정확하다(폴링 관측과 달리)
      expect(typeof entry.durationMs).toBe('number');
      expect(entry.detail).toMatchObject({ brand_name: '촉촉연구소' });
    });

    it('[활동 로그] 생성이 실패하면(브랜드 없음) 기록하지 않는다. 검증 실패는 활동이 아니다', async () => {
      const { channelId } = await seedChannel();
      activityLog.log.mockClear();

      await expect(
        service.generatePlans(planScope(channelId), '없는브랜드', KEYWORDS, 5, 6),
      ).rejects.toThrow();

      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('[비용] 사용량을 받으면 이벤트 시점 단가로 금액을 굳혀 기록한다', async () => {
      const { channelId } = await seedChannel();
      await settingsService.setAiModels(ownerScope(), { ...EMPTY_AI_MODELS, llm: 'claude-opus-4-8' });
      // 서버가 resolve 한 모델 + 실측 토큰
      planGen.usage = {
        model: 'claude-opus-4-8',
        inputTokens: 1_000_000,
        outputTokens: 1_000,
      };
      activityLog.log.mockClear();

      await service.generatePlans(planScope(channelId), '촉촉연구소', KEYWORDS, 5, 6);

      const entry = activityLog.log.mock.calls[0][0];
      // 1,000,000 × 5 + 1,000 × 25 = 5,025,000 µUSD (정수 곱셈, 반올림 0)
      expect(entry.cost).toMatchObject({
        status: 'computed',
        microUsd: 5_025_000,
        model: 'claude-opus-4-8',
        billing: 'org-key',
      });
      // 단가 버전을 남겨야 나중에 감사와 재계산이 가능
      expect(entry.cost?.rateVersion).toBeTruthy();
      // 토큰은 승격 컬럼으로도 간다(usage_daily 집계 근거)
      expect(entry.usage).toEqual({ tokenInput: 1_000_000, tokenOutput: 1_000 });
    });

    it('[비용] 사용량이 없으면(구 버전 LLM 서버) 금액을 비우고 usage-missing 으로 남긴다', async () => {
      const { channelId } = await seedChannel();
      await settingsService.setAiModels(ownerScope(), { ...EMPTY_AI_MODELS, llm: 'claude-opus-4-8' });
      planGen.usage = null; // 롤링 배포 중 구 서버 = usage 미제공
      activityLog.log.mockClear();

      await service.generatePlans(planScope(channelId), '촉촉연구소', KEYWORDS, 5, 6);

      const entry = activityLog.log.mock.calls[0][0];
      expect(entry.cost?.status).toBe('usage-missing');
      // 0 이 아니라 없음. 0 으로 위장하면 화면이 무료라고 거짓말하게 됨
      expect(entry.cost?.microUsd).toBeUndefined();
    });

    it('[모델] v1.5 는 개인이 고른 값과 무관하게 고정 모델로 부른다', async () => {
      // 그 버전에는 LLM 선택기가 없다. 고정하기 전에는 빈 모델명을 보내 language-model 이 자기
      //   기본(내장 Qwen3)으로 떨어뜨렸고, 어느 모델이 기획을 쓰는지 아무도 고르지 않은 상태였다.
      //   슬롯에 값이 남아 있어도 그것을 따르지 않는 것이 고정의 뜻
      const { channelId } = await seedChannel();
      await settingsService.setAiModels(ownerScope('v1.5'), { ...EMPTY_AI_MODELS, llm: 'internal-qwen3' });

      await service.generatePlans(planScope(channelId, 'v1.5'), '촉촉연구소', KEYWORDS, 5, 6);

      expect(planGen.lastContext?.model).toBe('claude-sonnet-5');
    });

    it('[모델] v1.0 은 개인이 고른 값을 그대로 쓴다', async () => {
      // 고정은 v1.5 만의 사실이다. 두 버전을 한 표에서 읽으므로 반대쪽도 함께 잠근다.
      //
      // "고른 모델이 컨텍스트로 간다" 를 검사하는 자리는 여기 하나다. 컨텍스트 조립 블록에도
      //   같은 검사가 있었는데, 그쪽은 버전을 적지 않아 기본 버전(v1.5)을 돌았다. 그 버전은 모델을
      //   고정하므로 저장값을 보지 않는데 고정값이 마침 저장한 값과 같아 우연히 통과하고
      //   있었다. 검사를 버전이 분명한 이 자리로 모으고 그쪽은 지웠다.
      const { channelId } = await seedChannel();
      await settingsService.setAiModels(ownerScope('v1.0'), { ...EMPTY_AI_MODELS, llm: 'claude-opus-4-8' });

      await service.generatePlans(planScope(channelId, 'v1.0'), '촉촉연구소', KEYWORDS, 5, 6);

      expect(planGen.lastContext?.model).toBe('claude-opus-4-8');
    });

    it('[비용] 사내 모델은 사용량이 없어도 free/0 이다. 모름과 구분된다', async () => {
      // v1.0 에서 확인. 개인이 고른 모델이 비용을 정하는 것은 그 버전의 규칙
      //   v1.5 는 기획 LLM 이 고정이라 고른 값이 비용에 닿지 않는다(아래 고정 케이스)
      const { channelId } = await seedChannel();
      await settingsService.setAiModels(ownerScope('v1.0'), { ...EMPTY_AI_MODELS, llm: 'internal-qwen3' });
      planGen.usage = null;
      activityLog.log.mockClear();

      await service.generatePlans(planScope(channelId, 'v1.0'), '촉촉연구소', KEYWORDS, 5, 6);

      const entry = activityLog.log.mock.calls[0][0];
      expect(entry.cost).toMatchObject({ status: 'free', microUsd: 0, billing: 'none' });
    });

    it('[비용] 서버가 resolve 한 모델에 귀속한다. 채널이 모델을 안 골랐어도', async () => {
      const { channelId } = await seedChannel();
      // 채널 LLM 미선택(빈 값) → 서버가 고른 모델이 유일한 귀속 근거다.
      planGen.usage = {
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 1_000_000,
        outputTokens: 0,
      };
      activityLog.log.mockClear();

      await service.generatePlans(planScope(channelId), '촉촉연구소', KEYWORDS, 5, 6);

      const entry = activityLog.log.mock.calls[0][0];
      expect(entry.cost?.model).toBe('claude-haiku-4-5-20251001');
      expect(entry.cost?.microUsd).toBe(1_000_000); // Haiku 입력 $1/1M
      expect(entry.detail?.llm_model).toBe('claude-haiku-4-5-20251001');
    });

    it('[비용] 추정 출력 토큰을 실측 옆에 남긴다. 추정 상수의 피드백 루프', async () => {
      const { channelId } = await seedChannel();
      planGen.usage = { model: 'internal-qwen3', inputTokens: 10, outputTokens: 20 };
      activityLog.log.mockClear();

      await service.generatePlans(planScope(channelId), '촉촉연구소', KEYWORDS, 5, 6);

      const entry = activityLog.log.mock.calls[0][0];
      expect(entry.detail?.estimated_output_tokens).toBe(1234); // FakePlanGenerator 가 보고한 값
    });
  });

  describe('suggestFocusKeywords (수집 우선, LLM 보완)', () => {
    /** 키워드 검색용 채널: 모델만 있으면 된다(수집 소스는 채널 설정을 요구하지 않는다) */
    async function seedKeywordChannel(): Promise<number> {
      const channelId = makeChannel('유튜브').id;
      // v1.0 슬롯에 넣는다: 이 describe 는 '기획서 생성과 같은 모델로 뽑는다' 를 보는데, 고른 값이
      //   실제로 쓰이는 버전이라야 그 성질이 관측된다(v1.5 는 고정이라 선택이 닿지 않는다)
      await settingsService.setAiModels(ownerScope('v1.0'), { ...EMPTY_AI_MODELS, llm: 'claude-opus-4-8' });
      return channelId;
    }

    it('검색어를 주는 소스 넷을 모두 부른다(채널 설정을 요구하지 않는다)', async () => {
      // 쇼핑인사이트는 채널이 고른 분야가 있어야 참여하고, 분야 미선택이면 조용히 빠진다.
      //   지금은 분야를 가리지 않고 전체를 보므로 설정 없이도 늘 참여. 그 회귀를 여기서 포착
      const channelId = await seedKeywordChannel();
      dataCollector.poolCalls.length = 0;

      await service.suggestFocusKeywords(planScope(channelId), '아기 발진');

      expect(dataCollector.poolCalls).toEqual(
        expect.arrayContaining(['ad:아기 발진', 'shopping:cid-1:daily', 'trends:KR', 'nate']),
      );
    });

    it('쇼핑인사이트 분야는 수집 서버 선택지를 따라 전부 부른다(상수를 들지 않는다)', async () => {
      // 분야 코드를 이 서버에 적어 두면 수집 서버가 분야를 늘려도 함께 늘지 않음
      //   그래서 목록의 출처가 선택지 응답임을 고정. 분야가 둘이면 호출도 둘
      const channelId = await seedKeywordChannel();
      dataCollector.poolCalls.length = 0;

      await service.suggestFocusKeywords(planScope(channelId), '아기 발진');

      const shoppingCalls = dataCollector.poolCalls.filter((c) => c.startsWith('shopping:'));
      expect(shoppingCalls).toEqual(['shopping:cid-1:daily', 'shopping:cid-2:daily']);
      // 선택지는 폴링마다 다시 받지 않는다(pool 밖에서 한 번)
      expect(
        dataCollector.poolCalls.filter((c) => c.startsWith('options:')),
      ).toEqual(['options:NAVER_SHOPPING_INSIGHT']);
    });

    it('일부 분야가 아직 수집 중이어도 확보된 분야로 후보를 만든다', async () => {
      // 전부 준비되기를 요구하면 한 분야가 늦을 때마다 검색 전체가 폴링 상한까지 대기
      dataCollector.collectingCids = new Set(['cid-1']);
      const channelId = await seedKeywordChannel();

      const out = await service.suggestFocusKeywords(planScope(channelId), '아기 발진');

      // cid-1 이 비어도 cid-2 의 값으로 소스가 참여한다(빈 채로 빠지지 않는다)
      expect(out.length).toBeGreaterThan(0);
    });

    it('수집 후보에는 출처가 붙고, 모자란 만큼만 LLM 이 채운다', async () => {
      const channelId = await seedKeywordChannel();

      const out = await service.suggestFocusKeywords(planScope(channelId, 'v1.0'), '  아기 발진  ');

      const collected = out.filter((c) => c.origin === 'collected');
      const generated = out.filter((c) => c.origin === 'generated');
      // 수집값은 어느 소스에서 왔는지 알 수 있어야 화면이 실측과 추정을 구분해 표시
      expect(collected.every((c) => !!c.source?.label)).toBe(true);
      expect(collected.map((c) => c.keyword)).toContain('아기 발진 크림');
      expect(generated.length).toBeGreaterThan(0);
      // 목표 개수를 채우는 것이 계약
      expect(out).toHaveLength(FOCUS_KEYWORD_SUGGESTION_COUNT);
      expect(focusKeywords.lastContext).toMatchObject({
        organizationId: ORG,
        model: 'claude-opus-4-8',
      });
      // 씨앗과 채널은 프롬프트에 실려 모델에 닿는다(컨텍스트 필드가 아니다). 씨앗은 앞뒤
      //   공백을 정리해 전달. 그대로 실으면 모델이 받는 주제에 공백이 붙음
      expect(seedOf(focusKeywords.lastContext!.userPrompt)).toBe('아기 발진');
      expect(focusKeywords.lastContext!.userPrompt).toContain('채널: 유튜브');
      // 조립은 그 버전의 조립기 담당. 서비스가 손으로 만든 문자열이 아님
      expect(focusKeywords.lastContext!.systemPrompt).toBe(
        ASSEMBLERS['v1.0'].focusKeywordSystemPrompt,
      );
      // 첫 보완 호출은 목표에서 수집분을 뺀 만큼 요청하고, 이미 나온 후보를 함께 보낸다.
      expect(focusKeywords.calls[0].needed).toBe(
        FOCUS_KEYWORD_SUGGESTION_COUNT - collected.length,
      );
      expect(existingOf(focusKeywords.calls[0].userPrompt)).toEqual(
        collected.map((c) => c.keyword),
      );
    });

    it('입력 키워드를 품지 않는 수집값은 후보에 섞이지 않는다', async () => {
      const channelId = await seedKeywordChannel();

      const out = await service.suggestFocusKeywords(planScope(channelId), '아기 발진');
      const keywords = out.map((c) => c.keyword);

      // 트렌드 소스는 그 시각의 인기어를 제공
      expect(keywords).not.toContain('전차');
      expect(keywords).not.toContain('탄핵');
      // 관련은 있어도 입력 키워드를 품지 않으면 롱테일이 아님
      expect(keywords).not.toContain('기저귀 발진 연고');
      expect(keywords).toContain('아기 발진 병원');
    });

    it('형식을 어긴 보완분은 목록에 넣지 않는다', async () => {
      // 프롬프트로 요구하되 지켰는지는 서버가 본다. 모델은 규칙을 어길 수 있고, 어긴 값이
      //   그대로 나가면 한 목록 안에서 롱테일과 아닌 것이 섞인다.
      const channelId = await seedKeywordChannel();
      focusKeywords.malformed = true;

      const out = await service.suggestFocusKeywords(planScope(channelId), '아기 발진');

      expect(out.every((c) => c.origin === 'collected')).toBe(true);
      expect(out.map((c) => c.keyword)).not.toContain('무관어1');
    });

    it('수집만으로 목표 개수를 채우면 LLM 을 부르지 않는다', async () => {
      const channelId = await seedKeywordChannel();
      dataCollector.adKeywords = Array.from({ length: FOCUS_KEYWORD_SUGGESTION_COUNT }, (_, i) => ({
        keyword: `아기 발진 ${i}`,
        monthlySearches: 100 - i,
      }));
      focusKeywords.calls.length = 0;

      const out = await service.suggestFocusKeywords(planScope(channelId), '아기 발진');

      expect(out).toHaveLength(FOCUS_KEYWORD_SUGGESTION_COUNT);
      expect(out.every((c) => c.origin === 'collected')).toBe(true);
      expect(focusKeywords.calls).toEqual([]); // 비용도 지연도 쓰지 않는다
    });

    it('한 번에 모자라게 오면 남은 만큼 다시 부른다(목표를 채운다)', async () => {
      const channelId = await seedKeywordChannel();
      focusKeywords.perCall = 6; // 요청보다 적게 주는 모델(한 번에 6개까지만)

      const out = await service.suggestFocusKeywords(planScope(channelId), '아기 발진');

      expect(out).toHaveLength(FOCUS_KEYWORD_SUGGESTION_COUNT);
      expect(focusKeywords.calls.length).toBeGreaterThan(1);
      // 재호출은 남은 만큼만 요청한다(같은 수를 다시 달라고 하지 않는다)
      expect(focusKeywords.calls[1].needed).toBeLessThan(focusKeywords.calls[0].needed);
      // 재호출에도 이미 나온 후보를 전부 보낸다(같은 말을 또 만들지 않게)
      expect(existingOf(focusKeywords.calls[1].userPrompt)).toHaveLength(
        existingOf(focusKeywords.calls[0].userPrompt).length + 6,
      );
      // 보완분도 수집분과 같은 형식이다(한 목록 안에서 성격이 갈리지 않는다)
      expect(out.every((c) => c.keyword.replace(/\s+/g, '').includes('아기발진'))).toBe(true);
    });

    it('새 말을 못 만드는 모델이면 상한에서 멈춘다(응답이 돌아오지 않는 것보다 낫다)', async () => {
      const channelId = await seedKeywordChannel();
      focusKeywords.repeating = true;

      const out = await service.suggestFocusKeywords(planScope(channelId), '아기 발진');

      expect(out.length).toBeLessThan(FOCUS_KEYWORD_SUGGESTION_COUNT);
      // 한 바퀴 돌아 하나도 못 늘면 더 부르지 않음
      expect(focusKeywords.calls.length).toBeLessThanOrEqual(2);
      // 같은 말이 두 줄로 남지도 않음
      expect(new Set(out.map((c) => c.keyword)).size).toBe(out.length);
    });

    it('보완이 실패해도 수집 후보가 있으면 그것만으로 진행한다', async () => {
      const channelId = await seedKeywordChannel();
      focusKeywords.failing = true;

      const out = await service.suggestFocusKeywords(planScope(channelId), '아기 발진');

      expect(out.length).toBeGreaterThan(0);
      expect(out.every((c) => c.origin === 'collected')).toBe(true);
    });

    it('수집 후보가 하나도 없는데 보완도 실패하면 오류를 올린다', async () => {
      const channelId = await seedKeywordChannel();
      dataCollector.adKeywords = [];
      dataCollector.trends = [];
      dataCollector.nate = [];
      dataCollector.shoppingInsight = {};
      focusKeywords.failing = true;

      // 빈 목록으로 답하면 '결과 없음' 과 '생성 실패' 가 구분되지 않음
      await expect(service.suggestFocusKeywords(planScope(channelId), '아기 발진')).rejects.toThrow();
    });


    it('주제가 비어 있으면 BadRequest (수집도 모델 호출도 하지 않는다)', async () => {
      const channelId = makeChannel('유튜브').id;
      focusKeywords.calls.length = 0;
      dataCollector.poolCalls.length = 0;

      await expect(service.suggestFocusKeywords(planScope(channelId), '   ')).rejects.toThrow(
        BadRequestException,
      );
      expect(focusKeywords.calls).toEqual([]);
      expect(dataCollector.poolCalls).toEqual([]);
    });

    it('없는 채널이면 NotFound 를 던져야 한다', async () => {
      await expect(service.suggestFocusKeywords(planScope(999), '아기 발진')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('generateSceneImage (개인 이미지 모델 + 브랜드 앵커 → 이미지 생성기 위임)', () => {
    /**
     * 씬 이미지는 v1.0 의 단계다. v1.5 는 영상 모델이 텍스트에서 바로 만들어 이미지를 쓰지
     * 않으므로, 이 블록은 그 버전을 명시한다(기본값 DEFAULT_TOOL_VERSION 은 v1.5 다)
     * v1.5 가 거절하는 것 자체는 아래 별도 검사 담당
     */
    const imageScope = (channelId: number) => planScope(channelId, 'v1.0');

    /**
     * 채널 하나 + 그 사람의 브랜드/컨셉 1세트 + 이미지 모델 준비
     * 개인 설정은 버전별로 저장되므로 위 imageScope 와 같은 버전에 심는다(안 맞추면 읽을 때 빈다)
     */
    async function seedImageChannel(): Promise<number> {
      const c = makeChannel('유튜브');
      await settingsService.setBrandConceptSets(ownerScope('v1.0'), [
        {
          brandName: '촉촉연구소',
          brandDescription: '보습 전문 브랜드', // 작업자 입력 원문: 이미지 프롬프트엔 오지 않는다
          // 저장값은 작업자가 화면에서 고른 그 문구(brandConceptOptions.resolveConcept)
          // 저장 입력은 고른 key(axis/option)만 담는다. 문구는 서버가 카탈로그에서 채운다.
          concepts: [
            { axis: 'style', option: 'live-action-closeup' },
            { axis: 'mood', option: 'warm-cozy' },
            { axis: 'tone', option: 'friendly-mom' },
          ],
        },
      ]);
      await settingsService.setAiModels(ownerScope('v1.0'), {
        llm: '',
        video: '',
        videoMode: '',
        tts: '',
        ttsVoice: '',
        ttsPitch: '',
        image: 'gpt-image-2',
      });
      return c.id;
    }

    const sceneInput = {
      brandName: '촉촉연구소',
      // LLM 이 쓴 시각 브리프: 자막과 나레이션, 브랜드 맥락의 의미가 이미 여기 접혀 있음
      imagePrompt: 'Close-up of hands applying sunscreen before going out, soft morning light',
      proposalTitle: '여름 자외선 루틴',
    };

    it('없는 채널이면 NotFound 를 던져야 한다', async () => {
      // 채널 검증이 브랜드/컨셉 조회에 얹혀 있으면 세트가 개인 스코프가 되는 순간 사라지고,
      //   남의 조직 채널 id 로도 통과해 활동 로그 대상에 그 id 가 박힌다.
      await seedImageChannel();
      await expect(service.generateSceneImage(imageScope(999), sceneInput)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('이미지 모델 미설정이면 BadRequest 를 던져야 한다', async () => {
      const c = makeChannel('유튜브');
      await settingsService.setBrandConceptSets(ownerScope(), [
        { brandName: '촉촉연구소', brandDescription: '', concepts: [] },
      ]);
      // image 모델 미설정(기본 '') → 400.
      await expect(service.generateSceneImage(imageScope(c.id), sceneInput)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('씬 이미지를 쓰지 않는 버전에서는 거절한다', async () => {
      // 화면에는 고를 자리도 요청할 자리도 없지만 낡은 탭이나 직접 호출은 여기로 올 수 있음
      //   그대로 만들면 결과물에 쓰이지 않는 이미지가 사내 GPU 를 점유하고 아무 에러도 나지 않음
      const channelId = await seedImageChannel();
      await expect(
        service.generateSceneImage(planScope(channelId, 'v1.5'), sceneInput),
      ).rejects.toThrow('이 버전은 씬 이미지를 사용하지 않습니다.');
    });

    it('brandName 이 그 사람의 브랜드/컨셉에 없으면 NotFound 를 던져야 한다', async () => {
      const channelId = await seedImageChannel();
      await expect(
        service.generateSceneImage(imageScope(channelId), { ...sceneInput, brandName: '없는브랜드' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('선택 이미지 모델 + 브랜드/씬 앵커를 생성기 컨텍스트로 넘기고 data URL 을 반환한다', async () => {
      const channelId = await seedImageChannel();
      const { dataUrl } = await service.generateSceneImage(imageScope(channelId), sceneInput);

      // b64 + mime 를 inline data URL 로 조립해 반환
      expect(dataUrl).toBe('data:image/png;base64,AAAA');

      const ctx = planImageGen.lastContext!;
      expect(ctx.organizationId).toBe(ORG);
      expect(ctx.model).toBe('gpt-image-2'); // 채널 선택 이미지 모델
      // 크기와 구도 지시가 그 버전의 화면비에서 함께 나온다(v1.0 = 4:5). 갈리면 모델이 만든
      //   그림과 렌더 캔버스가 어긋나 잘려 나감
      expect(ctx.size).toBe(imageSizeFor('4:5'));
      expect(ctx.prompt).toContain('(4:5)');
      expect(ctx.quality).toBe(PLAN_IMAGE_QUALITY);
      // seed = (기획안 제목 + 시각 브리프 + variant) 기반 결정적 값. 씬마다 달라 구도 복제 없음
      expect(ctx.seed).toBe(stableSeed(`${sceneInput.proposalTitle}#${sceneInput.imagePrompt}#0`));
      // 스타일 앵커 = 표현형식 + 무드(둘 다 비주얼) + 씬 브리프. 톤앤매너(화법)는 이미지에서 제외
      const styleText = resolveConceptText('style', 'live-action-closeup')!;
      const moodText = resolveConceptText('mood', 'warm-cozy')!;
      expect(ctx.prompt).toContain(`표현 형식: ${styleText.label}, ${styleText.note}`);
      expect(ctx.prompt).toContain(`무드: ${moodText.label}, ${moodText.note}`);
      expect(ctx.prompt).not.toContain('Tone');
      // 씬 브리프가 그대로 실린다(화면에 무엇이 담기는지의 전부)
      expect(ctx.prompt).toContain(sceneInput.imagePrompt);
      // 글자 렌더 금지(고정 규칙)
      expect(ctx.prompt).toContain('글자, 자막, 로고, 워터마크는 화면 어디에도 넣지 않는다');
      // 저장한 컨셉 값이 손대지 않고 그대로 실린다(화면에서 고른 그 문구가 그대로 나간다)
      expect(ctx.prompt).toContain('표현 형식: 실사 클로즈업 필름룩');
      expect(ctx.prompt).toContain('무드: 웜 & 코지(따뜻한 자연광)');
    });

    it('기획안이 준 조합으로 앵커를 만든다: 세트가 바뀌어도 처음 만든 연출이 재현된다', async () => {
      const channelId = await seedImageChannel();
      // 기획안을 만든 뒤 세트를 다른 무드로 바꿔 둔다(설정 화면에서 흔히 일어난다)
      await settingsService.setBrandConceptSets(ownerScope(), [
        {
          brandName: '촉촉연구소',
          brandDescription: '보습 전문 브랜드',
          concepts: [{ axis: 'mood', option: 'bright-vivid' }],
        },
      ]);

      await service.generateSceneImage(imageScope(channelId), {
        ...sceneInput,
        concepts: [
          { axis: 'style', option: 'live-action-closeup' },
          { axis: 'mood', option: 'warm-cozy' },
        ],
      });

      // 기획안이 들고 있는 조합이 우선. 세트를 다시 읽으면 처음 이미지와 화풍이 어긋남
      const warm = resolveConceptText('mood', 'warm-cozy')!;
      const bright = resolveConceptText('mood', 'bright-vivid')!;
      expect(planImageGen.lastContext!.prompt).toContain(`무드: ${warm.label}`);
      expect(planImageGen.lastContext!.prompt).not.toContain(`무드: ${bright.label}`);
    });

    it('씬 브리프가 다르면 다른 seed(구도 달라짐), 같은 씬 재생성은 동일 seed(재현성)를 받는다', async () => {
      const channelId = await seedImageChannel();
      await service.generateSceneImage(imageScope(channelId), { ...sceneInput, imagePrompt: 'Shot A' });
      const seedA = planImageGen.lastContext!.seed;
      await service.generateSceneImage(imageScope(channelId), { ...sceneInput, imagePrompt: 'Shot B' });
      const seedB = planImageGen.lastContext!.seed;
      await service.generateSceneImage(imageScope(channelId), { ...sceneInput, imagePrompt: 'Shot A' });
      const seedA2 = planImageGen.lastContext!.seed;

      expect(seedA).not.toBe(seedB); // 다른 씬 → 다른 seed(구도 복제 방지)
      expect(seedA2).toBe(seedA); // 같은 씬 재생성 → 동일 seed(재현성)
    });

    it('재시도 변주(variant)가 오르면 다른 seed 를 받는다(같은 씬의 다른 버전)', async () => {
      const channelId = await seedImageChannel();
      await service.generateSceneImage(imageScope(channelId), sceneInput); // variant 기본 0
      const seed0 = planImageGen.lastContext!.seed;
      await service.generateSceneImage(imageScope(channelId), { ...sceneInput, variant: 1 });
      const seed1 = planImageGen.lastContext!.seed;
      expect(seed1).not.toBe(seed0);
      expect(seed0).toBe(stableSeed(`${sceneInput.proposalTitle}#${sceneInput.imagePrompt}#0`));
      expect(seed1).toBe(stableSeed(`${sceneInput.proposalTitle}#${sceneInput.imagePrompt}#1`));
    });

    it('[활동 로그] 씬 이미지 생성도 행위자와 함께 기록한다', async () => {
      const channelId = await seedImageChannel();
      activityLog.log.mockClear();

      await service.generateSceneImage(imageScope(channelId), {
        brandName: '촉촉연구소',
        imagePrompt: 'a serum bottle on a marble table',
      });

      expect(activityLog.log).toHaveBeenCalledTimes(1);
      const entry = activityLog.log.mock.calls[0][0];
      expect(entry).toMatchObject({
        actorUserId: OWNER,
        channelId,
        action: 'plan.scene_image_generated',
      });
      expect(typeof entry.durationMs).toBe('number');
      expect(entry.detail).toMatchObject({ image_model: expect.any(String) });
    });
  });

  describe('plan prompt (작업자 편집 지침: 고정 머리/꼬리 + 편집 중간)', () => {
    it('없는 채널이면 NotFound 를 던져야 한다', async () => {
      await expect(service.getPlanPrompt(planScope(999))).rejects.toThrow(NotFoundException);
      await expect(service.setPlanPrompt(planScope(999), 'x')).rejects.toThrow(NotFoundException);
    });

    it.each(TOOL_VERSIONS)(
      '미설정이면 **그 버전의** 고정 머리/꼬리 + 기본 지침을 반환한다 (%s)',
      async (version) => {
        // 고정부를 상수로 비교하지 않고 조립기에서 가져오는 이유: 화면이 보여주는 것과 실제로
        //   나가는 것이 같아야 하고, 그 둘의 출처가 조립기 하나여야 어긋날 수 없음
        const c = makeChannel('유튜브');
        const expected = ASSEMBLERS[version].promptView('', '');
        const view = await service.getPlanPrompt(planScope(c.id, version));
        expect(view.header).toBe(expected.header);
        expect(view.footer).toBe(expected.footer);
        expect(view.defaultInstructions).toBe(ASSEMBLERS[version].defaultInstructions);
        expect(view.instructions).toBe(ASSEMBLERS[version].defaultInstructions);
        // 이미지 모델 미설정 → 안전 제약 없음
        expect(view.imageSafetyDirective).toBe('');
      },
    );

    it('이미지 모델에 따라 안전 제약을 뷰에 노출한다(화면 = 실제 프롬프트)', async () => {
      const c = makeChannel('유튜브');

      // OpenAI 이미지 모델 → 제약이 보인다. 씬 이미지를 만드는 버전(v1.0)의 이야기다.
      await settingsService.setAiModels(ownerScope('v1.0'), { ...EMPTY_AI_MODELS, image: 'gpt-image-2' });
      const openai = await service.getPlanPrompt(planScope(c.id, 'v1.0'));
      expect(openai.imageSafetyDirective).toContain('영유아나 미성년의 신체를 컷의 주제로 삼지 않는다');

      // 뷰에 보이는 문구가 실제로 생성에 나가는 것과 같아야 한다(어긋나면 보여주는 의미가 없다)
      //   그래서 생성이 쓰는 조립기로 만든다: 도메인 함수를 따로 부르면 조립기가 갈리는 날
      //   이 검사만 통과하고 화면은 거짓을 말하게 됨
      const system = PLAN_PROMPT_ASSEMBLER_V10.systemPrompt({
        instructions: DEFAULT_PLAN_INSTRUCTIONS,
        proposalCount: 2,
        sceneCount: 4,
        excludeInfographic: false,
        imageModel: 'gpt-image-2',
        hasPurposeKeywords: true,
        hasBrand: true,
        hasConcepts: true,
      });
      expect(system).toContain(openai.imageSafetyDirective);

      // 자체(FLUX) → 제약 없음
      await settingsService.setAiModels(ownerScope('v1.0'), { ...EMPTY_AI_MODELS, image: 'flux-schnell' });
      expect((await service.getPlanPrompt(planScope(c.id, 'v1.0'))).imageSafetyDirective).toBe('');
    });

    it('씬 이미지를 만들지 않는 버전은 이미지 안전 제약을 보여주지 않는다', async () => {
      // 화면이 실제로 나가는 프롬프트를 보여준다는 것이 이 뷰의 존재 이유다. v1.5 는 이미지를
      //   만들지 않으므로 그 제약도 나가지 않는다. 저장값이 남아 있어도 마찬가지다.
      const c = makeChannel('유튜브');
      await settingsService.setAiModels(ownerScope('v1.5'), { ...EMPTY_AI_MODELS, image: 'gpt-image-2' });
      expect((await service.getPlanPrompt(planScope(c.id, 'v1.5'))).imageSafetyDirective).toBe('');
    });

    it('편집분을 저장하면 조회에 반영되고, 머리/꼬리는 고정이다', async () => {
      const c = makeChannel('유튜브');
      const fixed = ASSEMBLERS[DEFAULT_TOOL_VERSION].promptView('', '');
      const saved = await service.setPlanPrompt(planScope(c.id), '  브랜드는 절대 언급하지 마라  ');
      expect(saved.instructions).toBe('브랜드는 절대 언급하지 마라'); // 트림
      expect(saved.header).toBe(fixed.header);
      expect(saved.footer).toBe(fixed.footer);
      expect((await service.getPlanPrompt(planScope(c.id))).instructions).toBe('브랜드는 절대 언급하지 마라');
    });

    it.each(TOOL_VERSIONS)(
      '빈 값 또는 **그 버전의** 기본값을 저장하면 기본 지침으로 리셋된다 (%s)',
      async (version) => {
        // 버전마다 기본 지침이 다르므로 "기본값과 같으면 비운다" 판정도 그 버전 것을 봐야 함
        //   한 버전 것으로 비교하면 다른 버전은 자기 기본을 저장했는데 커스텀으로 굳음
        const c = makeChannel('유튜브');
        const fallback = ASSEMBLERS[version].defaultInstructions;
        const scope = planScope(c.id, version);

        await service.setPlanPrompt(scope, '커스텀');
        await service.setPlanPrompt(scope, '   '); // 빈 값
        expect((await service.getPlanPrompt(scope)).instructions).toBe(fallback);

        await service.setPlanPrompt(scope, fallback); // 기본값과 동일
        expect((await service.getPlanPrompt(scope)).instructions).toBe(fallback);
      },
    );
  });
});
