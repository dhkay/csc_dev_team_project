import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BrandConceptAxis,
  BRAND_CONCEPT_AXES,
  BRAND_CONCEPTS_JSON_MAX_BYTES,
  BRAND_CONCEPT_KEY_MAX_LEN,
  BRAND_CONCEPT_MAX_SETS,
  BRAND_CONCEPT_TEXT_MAX_LEN,
  CONCEPT_MAX_PER_SET,
  CUSTOM_AXES_MAX_PER_SET,
  CUSTOM_DESCRIPTION_MAX_LEN,
  CUSTOM_LABEL_MAX_LEN,
  CUSTOM_OPTIONS_MAX_PER_AXIS,
  CUSTOM_OPTIONS_MAX_PER_SET,
  ConceptChoice,
  ConceptResolver,
  ConceptSelection,
  CustomConceptAxis,
  CustomConceptOption,
  createConceptResolver,
  isCatalogAxis,
  isCustomConceptKey,
  mergeCollectedKeywords,
} from '../../domain';
import {
  ChannelSettingsPort,
  BrandConceptSet,
  BrandConceptSetInput,
  AiModelSelection,
  CollectedKeywordCandidate,
} from '../ports/inbound';
import {
  toolVersionOrDefault,
  type ToolVersion,
} from '../../../../../shared/domain/tool-version';
import type { OwnerVersionScope } from '../../../../../shared/domain/workspace-scope';
import {
  ChannelSettingsRepositoryPort,
  CHANNEL_SETTINGS_REPOSITORY_PORT,
  DataCollectorPort,
  KeywordPoolSnapshot,
  DATA_COLLECTOR_PORT,
  UserToolSettingsRepositoryPort,
  USER_TOOL_SETTINGS_REPOSITORY_PORT,
} from '../ports/outbound';
import {
  ChannelPort,
  CHANNEL_PORT,
} from '../../../../channel/core/application/ports/inbound';

// AI 모델 id 최대 길이(opaque, DTO 검증과 동일)
const AI_MODEL_MAX_LEN = 64;

// 소스 식별자. 수집 서버 카탈로그와 프론트 카탈로그가 같은 문자열 사용
const SHOPPING_INSIGHT_SOURCE_KEY = 'NAVER_SHOPPING_INSIGHT';
const AD_KEYWORD_SOURCE_KEY = 'NAVER_AD_KEYWORD';
const GOOGLE_TRENDS_SOURCE_KEY = 'GOOGLE_TRENDS';
const NATE_REALTIME_SOURCE_KEY = 'NATE_REALTIME';

// 쇼핑인사이트 수집기간 선호값(카탈로그가 아니라 도구의 판단). 선택지에 없으면 첫 항목으로 후퇴
const SHOPPING_INSIGHT_PREFERRED_PERIOD = 'daily';

// 구글 트렌드 조회 지역. 국내 마케팅 기준이라 고정
const KEYWORD_POOL_GEO = 'KR';
// 수집 대기: 간격 x 횟수 = 상한
const KEYWORD_POOL_POLL_INTERVAL_MS = 1500;
const KEYWORD_POOL_MAX_POLLS = 8;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 기획서 편집 지침의 채널별 설정 key. 지침이 그 버전 프롬프트 구조를 전제하므로 버전을 키에 포함
const planPromptSettingsKey = (version: ToolVersion) => `PLAN_PROMPT:${version}`;

// 편집 지침 최대 길이(프롬프트 과대화 방지)
const PLAN_PROMPT_MAX_LEN = 8000;

/**
 * ChannelSettingsPort 구현: 도구 설정 + 수집 소스 중계
 *
 * 저장소가 둘이고 경계는 스코프. 개인 행(marketing_user_tool_settings)은 모델 선택, 브랜드/컨셉
 * 세트, 진입 버전, 진입 채널을, 채널 KV(marketing_channel_source_settings)는 기획 프롬프트 지침을 담음
 */
@Injectable()
export class ChannelSettingsService implements ChannelSettingsPort {
  constructor(
    @Inject(CHANNEL_SETTINGS_REPOSITORY_PORT)
    private readonly settings: ChannelSettingsRepositoryPort,
    @Inject(DATA_COLLECTOR_PORT)
    private readonly dataCollector: DataCollectorPort,
    @Inject(CHANNEL_PORT)
    private readonly channels: ChannelPort,
    @Inject(USER_TOOL_SETTINGS_REPOSITORY_PORT)
    private readonly userSettings: UserToolSettingsRepositoryPort,
  ) {}

  private readonly logger = new Logger(ChannelSettingsService.name);

  /**
   * 그 스코프 버전의 AI 모델 선택. 미선택이면 빈 선택(각 모델 서버의 기본)
   * 버전을 스코프가 주므로 한 요청이 처음부터 끝까지 같은 슬롯을 읽음
   */
  async getAiModels(scope: OwnerVersionScope): Promise<AiModelSelection> {
    const record = await this.userSettings.findRecord(
      scope.organizationId,
      scope.ownerUserId,
    );
    return parseAiModelSelection(record?.aiModels, scope.version);
  }

  /** 도구 재진입 시 열릴 버전. 미선택이면 기본 */
  async getEntryVersion(organizationId: number, ownerUserId: number): Promise<ToolVersion> {
    const record = await this.userSettings.findRecord(organizationId, ownerUserId);
    return toolVersionOrDefault(record?.entryVersion);
  }

  /**
   * 진입 기본 버전 갱신. 선택 맵은 미변경이라 버전을 오가도 각 버전 설정이 남음
   * 모르는 값은 기본으로 좁힘(진입 차단과 도달 불가 슬롯 방지)
   */
  async setEntryVersion(
    organizationId: number,
    ownerUserId: number,
    version: string,
  ): Promise<ToolVersion> {
    const value = toolVersionOrDefault(version);
    await this.userSettings.upsertEntryVersionRecord(organizationId, ownerUserId, value);
    return value;
  }

  /**
   * 도구 진입 시 먼저 열릴 채널. 미지정이면 null 이고 호출부가 첫 채널로 접음
   * 채널 존재는 미검증(선택 후 삭제될 수 있어 읽는 쪽이 어차피 접어야 함)
   */
  async getDefaultChannelId(organizationId: number, ownerUserId: number): Promise<number | null> {
    const record = await this.userSettings.findRecord(organizationId, ownerUserId);
    return record?.defaultChannelId ?? null;
  }

  /** 진입 채널 지정(null = 해제), 확정된 값 반환 */
  async setDefaultChannelId(
    organizationId: number,
    ownerUserId: number,
    channelId: number | null,
  ): Promise<number | null> {
    const value = channelId != null && Number.isInteger(channelId) && channelId > 0 ? channelId : null;
    const record = await this.userSettings.upsertDefaultChannelRecord(
      organizationId,
      ownerUserId,
      value,
    );
    return record.defaultChannelId;
  }

  /** 그 버전의 선택 교체 저장(트림과 길이 방어 후). 다른 버전 슬롯은 미변경 */
  async setAiModels(
    scope: OwnerVersionScope,
    selection: AiModelSelection,
  ): Promise<AiModelSelection> {
    const record = await this.userSettings.findRecord(
      scope.organizationId,
      scope.ownerUserId,
    );
    const value = normalizeAiModelSelection(selection);
    // 맵 전체 교체라 남은 슬롯 유실 시 그 버전 설정 소실
    const next = { ...parseVersionSlots(record?.aiModels), [scope.version]: value };
    await this.userSettings.upsertAiModelsRecord(
      scope.organizationId,
      scope.ownerUserId,
      JSON.stringify(next),
    );
    return value;
  }

  /** 브랜드/컨셉 선택지 목록(축과 각 옵션). 화면의 칩 렌더용 */
  getBrandConceptCatalog(): BrandConceptAxis[] {
    return BRAND_CONCEPT_AXES;
  }

  /**
   * 그 사람의 브랜드/컨셉 세트 목록. 미생성이면 빈 배열
   * 채널 무관이고 스코프 버전의 것만 반환(두 버전은 연출 방향 비공유)
   */
  async getBrandConceptSets(scope: OwnerVersionScope): Promise<BrandConceptSet[]> {
    const record = await this.userSettings.findRecord(
      scope.organizationId,
      scope.ownerUserId,
    );
    return toBrandConceptSets(
      parseBrandConceptSetInputs(record?.brandConcepts, scope.version),
    );
  }

  /**
   * 세트 목록 교체 저장(무엇을 골랐는가). 트림과 길이 방어, 빈 브랜드명 제거, 중복 제거, 개수 컷
   *
   * 커스텀 정의는 요청에서 받지 않고 저장분 유지. 화면의 낡은 정의로 저장 시 정의 되돌림 방지
   * 이름을 바꾼 세트만 예외(새 이름으로는 저장분이 없어 요청의 정의 사용)
   */
  async setBrandConceptSets(
    scope: OwnerVersionScope,
    sets: BrandConceptSetInput[],
  ): Promise<BrandConceptSet[]> {
    const record = await this.userSettings.findRecord(
      scope.organizationId,
      scope.ownerUserId,
    );
    const stored = new Map(
      parseBrandConceptSetInputs(record?.brandConcepts, scope.version).map((s) => [
        s.brandName,
        s,
      ]),
    );
    const withStoredDefinitions = sets.map((s) => {
      const saved = stored.get(conceptText(s?.brandName, BRAND_CONCEPT_TEXT_MAX_LEN));
      return {
        ...s,
        customAxes: saved ? saved.customAxes : s?.customAxes,
        customOptions: saved ? saved.customOptions : s?.customOptions,
      };
    });
    const normalized = normalizeBrandConceptSets(withStoredDefinitions);
    assertKnownConcepts(normalized);
    return this.writeBrandConceptSets(scope, record?.brandConcepts, normalized);
  }

  /**
   * 세트 하나의 연출 교체 저장(정의 + 그중 무엇을 골랐는지)
   * 브랜드명과 설명, 다른 세트는 미변경. 정의 삭제 시 그것을 가리킨 선택도 함께 정리
   */
  async setBrandConceptSetDetail(
    scope: OwnerVersionScope,
    brandName: string,
    detail: {
      customAxes: CustomConceptAxis[];
      customOptions: CustomConceptOption[];
      concepts: ConceptChoice[];
    },
  ): Promise<BrandConceptSet[]> {
    const record = await this.userSettings.findRecord(
      scope.organizationId,
      scope.ownerUserId,
    );
    const stored = parseBrandConceptSetInputs(record?.brandConcepts, scope.version);
    const target = conceptText(brandName, BRAND_CONCEPT_TEXT_MAX_LEN);
    if (!stored.some((s) => s.brandName === target)) {
      // 미저장 브랜드는 붙일 자리 없음(정의와 선택 모두 그 세트 안에 존재)
      throw new NotFoundException('브랜드/컨셉을 찾을 수 없습니다.');
    }
    const patched = stored.map((s) => (s.brandName === target ? { ...s, ...detail } : s));
    const normalized = normalizeBrandConceptSets(patched);
    assertKnownConcepts(normalized);
    return this.writeBrandConceptSets(scope, record?.brandConcepts, normalized);
  }

  /** 두 저장 경로의 공통 뒤끝: 그 버전 슬롯만 교체, 총량 측정, 문구 채워 반환 */
  private async writeBrandConceptSets(
    scope: OwnerVersionScope,
    current: string | null | undefined,
    normalized: BrandConceptSetInput[],
  ): Promise<BrandConceptSet[]> {
    // 맵 전체 교체라 남은 슬롯 유실 시 그 버전 설정 소실
    const next = {
      ...parseVersionSlots(current),
      [scope.version]: { sets: normalized },
    };
    const payload = JSON.stringify(next);
    // 필드별 상한은 곱해짐(세트 x 레퍼런스 x 글자). 총량을 막을 자리가 저장 시점뿐
    if (Buffer.byteLength(payload, 'utf8') > BRAND_CONCEPTS_JSON_MAX_BYTES) {
      throw new BadRequestException(
        '브랜드/컨셉 설정이 너무 큽니다. 사용하지 않는 세트나 레퍼런스를 정리해 주세요.',
      );
    }
    await this.userSettings.upsertBrandConceptsRecord(
      scope.organizationId,
      scope.ownerUserId,
      payload,
    );
    // 저장은 선택만, 응답은 문구까지: 저장 직후에도 화면이 현재 문구를 봄
    return toBrandConceptSets(normalized);
  }

  async getPlanInstructionsOverride(
    channelId: number,
    version: ToolVersion,
  ): Promise<string> {
    const record = await this.settings.findRecord(channelId, planPromptSettingsKey(version));
    return parsePlanInstructionsOverride(record?.settings);
  }

  async setPlanInstructionsOverride(
    scope: OwnerVersionScope,
    channelId: number,
    instructions: string,
  ): Promise<void> {
    await this.assertChannelExists(scope.organizationId, scope.ownerUserId, channelId);
    const value = (typeof instructions === 'string' ? instructions : '')
      .trim()
      .slice(0, PLAN_PROMPT_MAX_LEN);
    await this.settings.upsertRecord(
      scope.organizationId,
      channelId,
      planPromptSettingsKey(scope.version),
      JSON.stringify({ instructions: value }),
    );
  }

  /**
   * 씨앗 주제로 키워드 후보 수집. 검색어를 직접 주는 소스만 신뢰도 순으로 참여
   * 각 소스는 best-effort 라 실패하거나 오래 걸리는 소스만 빠짐
   */
  async collectKeywordCandidates(seed: string): Promise<CollectedKeywordCandidate[]> {
    const trimmed = seed.trim();
    if (!trimmed) return [];

    // pool 밖에서 한 번만 받음. 안에서 받으면 폴링마다 선택지를 다시 받아 호출 급증
    const shoppingInsightTargets = await this.resolveShoppingInsightTargets();

    const pools: { key: string; label: string; fetch: () => Promise<KeywordPoolSnapshot> }[] = [
      {
        key: AD_KEYWORD_SOURCE_KEY,
        label: '네이버 검색광고',
        fetch: () => this.dataCollector.fetchAdKeywords(trimmed),
      },
      // 선택지를 못 받으면 미참여(빈 결과의 성공 위장 방지)
      ...(shoppingInsightTargets.length > 0
        ? [
            {
              key: SHOPPING_INSIGHT_SOURCE_KEY,
              label: '네이버 쇼핑인사이트',
              fetch: () => this.shoppingInsightPool(shoppingInsightTargets),
            },
          ]
        : []),
      {
        key: GOOGLE_TRENDS_SOURCE_KEY,
        label: '구글 트렌드',
        fetch: () => this.dataCollector.fetchGoogleTrends(KEYWORD_POOL_GEO),
      },
      {
        key: NATE_REALTIME_SOURCE_KEY,
        label: '네이트 실시간',
        fetch: () => this.dataCollector.fetchNateRealtime(),
      },
    ];

    const results = await Promise.all(
      pools.map(async (pool) => {
        const snapshot = await this.awaitCollected(pool.fetch);
        return snapshot.keywords.map((item) => ({
          keyword: item.keyword,
          sourceKey: pool.key,
          sourceLabel: pool.label,
          monthlySearches: item.monthlySearches,
        }));
      }),
    );
    return mergeCollectedKeywords(trimmed, results.flat());
  }

  /**
   * 쇼핑인사이트 조회 대상 결정(모든 분야 + 기간 하나)
   *
   * 데이터랩은 분야 필수라 전체 조회가 없어 분야 목록은 수집 서버 선택지가 결정
   * 선택지 조회 실패 시 빈 배열로 이 소스만 제외(여기서 던지면 검색 전체 차단)
   */
  private async resolveShoppingInsightTargets(): Promise<
    { cid: string; period: string }[]
  > {
    try {
      const options = await this.dataCollector.getSourceOptions(SHOPPING_INSIGHT_SOURCE_KEY);
      const periods = options.periods ?? [];
      const period =
        periods.find((p) => p.value === SHOPPING_INSIGHT_PREFERRED_PERIOD)?.value ??
        periods[0]?.value;
      if (!period) return [];
      return (options.categories ?? []).map((c) => ({ cid: c.value, period }));
    } catch (err) {
      this.logger.warn(
        `쇼핑인사이트 수집 선택지 조회 실패 → 이 소스 없이 진행: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }
  }

  /**
   * 분야별 스냅샷을 하나의 키워드 풀로 병합. 겹치는 말은 먼저 온 것만 유지
   * 하나라도 검색어를 얻으면 ok(반대로 하면 한 분야가 늦을 때마다 폴링 상한까지 대기)
   */
  private async shoppingInsightPool(
    targets: { cid: string; period: string }[],
  ): Promise<KeywordPoolSnapshot> {
    const snapshots = await Promise.all(
      targets.map((t) => this.dataCollector.fetchShoppingInsight(t.cid, t.period)),
    );

    const seen = new Set<string>();
    const keywords: KeywordPoolSnapshot['keywords'] = [];
    for (const snapshot of snapshots) {
      for (const item of snapshot.keywords) {
        if (seen.has(item.keyword)) continue;
        seen.add(item.keyword);
        keywords.push(item);
      }
    }

    if (keywords.length > 0) return { status: 'ok', keywords };
    const status = snapshots.some((s) => s.status === 'collecting') ? 'collecting' : 'failed';
    return { status, keywords: [] };
  }

  /**
   * 수집 완료 대기(수집 서버는 첫 조회에 collecting 을 주고 워커가 뒤에서 처리)
   * 상한 초과 시 그 소스는 빈 채로 두고 나머지로 진행
   */
  private async awaitCollected(
    fetch: () => Promise<KeywordPoolSnapshot>,
  ): Promise<KeywordPoolSnapshot> {
    let snapshot = await fetch();
    for (let i = 0; snapshot.status === 'collecting' && i < KEYWORD_POOL_MAX_POLLS; i += 1) {
      await delay(KEYWORD_POOL_POLL_INTERVAL_MS);
      snapshot = await fetch();
    }
    if (snapshot.status === 'collecting') {
      this.logger.warn('키워드 원천 수집이 대기 상한을 넘겨 이번 검색에서 제외한다');
      return { status: 'collecting', keywords: [] };
    }
    return snapshot;
  }

  /** 채널 소유 검증. 없는 채널과 남의 채널이 같은 응답(존재 노출 방지) */
  private async assertChannelExists(
    organizationId: number,
    ownerUserId: number,
    channelId: number,
  ): Promise<void> {
    const channel = await this.channels.getChannel(organizationId, ownerUserId, channelId);
    if (!channel) {
      throw new NotFoundException('채널을 찾을 수 없습니다.');
    }
  }
}

const conceptKey = (v: unknown): string =>
  (typeof v === 'string' ? v : '').trim().slice(0, BRAND_CONCEPT_KEY_MAX_LEN);
const conceptText = (v: unknown, max: number): string =>
  (typeof v === 'string' ? v : '').trim().slice(0, max);

// 커스텀 문구 정규화. 프롬프트에서 한 줄을 이루므로 개행과 연속 공백을 한 칸으로 접음
const customText = (v: unknown, max: number): string =>
  (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * 세트가 더한 카테고리(축) 정규화. 어긋난 정의는 400 대신 폐기(배열 전체 교체라 편집 전체 유실 방지)
 * 이름이 기본 카테고리와 겹치면 프롬프트에 같은 축 줄이 둘 실려 폐기
 */
function normalizeCustomAxes(raw: unknown): CustomConceptAxis[] {
  if (!Array.isArray(raw)) return [];
  const reserved = new Set(BRAND_CONCEPT_AXES.map((a) => a.label));
  const byLabel = new Map<string, CustomConceptAxis>();
  const byKey = new Set<string>();
  for (const x of raw) {
    const o = (x ?? {}) as Record<string, unknown>;
    const key = conceptKey(o.key);
    const label = customText(o.label, CUSTOM_LABEL_MAX_LEN);
    // key 형식 검증이 기본 축 key 사칭을 막는 지점
    if (!isCustomConceptKey(key) || label.length === 0) continue;
    if (reserved.has(label) || byKey.has(key)) continue;
    byKey.add(key);
    byLabel.set(label, { key, label });
  }
  return [...byLabel.values()].slice(0, CUSTOM_AXES_MAX_PER_SET);
}

/**
 * 세트가 더한 레퍼런스(옵션) 정규화. axis 가 기본 축도 그 세트의 커스텀 축도 아니면 고아라 폐기
 * 한 축 안의 이름 중복도 폐기(같은 이름 칩이 둘이면 선택 구별 불가)
 */
function normalizeCustomOptions(
  raw: unknown,
  customAxes: CustomConceptAxis[],
): CustomConceptOption[] {
  if (!Array.isArray(raw)) return [];
  const customAxisKeys = new Set(customAxes.map((a) => a.key));
  // key 를 string 으로 넓힘. 조회 대상 axis 는 요청에서 온 임의 문자열이라 유니온으로는 조회 불가
  const catalogLabels = new Map<string, Set<string>>(
    BRAND_CONCEPT_AXES.map((a) => [a.key, new Set(a.options.map((o) => o.label))]),
  );
  const perAxis = new Map<string, Map<string, CustomConceptOption>>();
  const seenKeys = new Set<string>();
  for (const x of raw) {
    const o = (x ?? {}) as Record<string, unknown>;
    const axis = conceptKey(o.axis);
    const key = conceptKey(o.key);
    const label = customText(o.label, CUSTOM_LABEL_MAX_LEN);
    if (!isCustomConceptKey(key) || label.length === 0 || seenKeys.has(key)) continue;
    if (!isCatalogAxis(axis) && !customAxisKeys.has(axis)) continue;
    if (catalogLabels.get(axis)?.has(label)) continue;
    const bucket = perAxis.get(axis) ?? new Map<string, CustomConceptOption>();
    if (!perAxis.has(axis)) perAxis.set(axis, bucket);
    if (bucket.size >= CUSTOM_OPTIONS_MAX_PER_AXIS && !bucket.has(label)) continue;
    seenKeys.add(key);
    bucket.set(label, {
      axis,
      key,
      label,
      description: customText(o.description, CUSTOM_DESCRIPTION_MAX_LEN),
    });
  }
  return [...perAxis.values()]
    .flatMap((bucket) => [...bucket.values()])
    .slice(0, CUSTOM_OPTIONS_MAX_PER_SET);
}

/**
 * 컨셉 선택 배열 정규화(트림과 길이컷, 빈 항목 제거, 축당 하나로 좁힘, 개수 컷)
 *
 * 축당 하나만 유지(뒤에 온 것이 승리). 같은 축이 둘이면 모델이 상반된 지시를 받음
 * resolve 를 받는 이유는 폐기된 커스텀 정의를 가리키는 선택의 동반 제거이고,
 * 기본 축과 옵션의 미해석은 남겨 뒤의 검증이 잡게 함
 */
function normalizeConcepts(raw: unknown, resolve: ConceptResolver): ConceptChoice[] {
  if (!Array.isArray(raw)) return [];
  const byAxis = new Map<string, ConceptChoice>();
  for (const c of raw) {
    const o = (c ?? {}) as Record<string, unknown>;
    const choice = { axis: conceptKey(o.axis), option: conceptKey(o.option) };
    if (choice.axis.length === 0 || choice.option.length === 0) continue;
    const touchesCustom =
      isCustomConceptKey(choice.axis) || isCustomConceptKey(choice.option);
    if (touchesCustom && !resolve(choice.axis, choice.option)) continue;
    byAxis.set(choice.axis, choice);
  }
  return [...byAxis.values()].slice(0, CONCEPT_MAX_PER_SET);
}

/**
 * 브랜드/컨셉 세트 정규화(저장 형태). 트림과 길이컷, 빈 브랜드명 제거, 중복 제거, 개수 컷
 * 브랜드명이 세트 식별자라 중복을 여기서 막고, 나중에 온 것을 유지(방금 고친 쪽이 현재 정의)
 */
function normalizeBrandConceptSets(sets: BrandConceptSetInput[]): BrandConceptSetInput[] {
  const byName = new Map<string, BrandConceptSetInput>();
  for (const s of sets) {
    const brandName = conceptText(s?.brandName, BRAND_CONCEPT_TEXT_MAX_LEN);
    if (brandName.length === 0) continue;
    // 커스텀 정의를 먼저 정리. 살아남은 것을 알아야 그것을 가리키는 선택을 고를 수 있음
    const customAxes = normalizeCustomAxes(s?.customAxes);
    const customOptions = normalizeCustomOptions(s?.customOptions, customAxes);
    const set: BrandConceptSetInput = {
      brandName,
      brandDescription: conceptText(s?.brandDescription, BRAND_CONCEPT_TEXT_MAX_LEN),
      concepts: normalizeConcepts(
        s?.concepts,
        createConceptResolver({ customAxes, customOptions }),
      ),
      // 빈 배열은 키를 만들지 않음(커스텀 미사용자의 저장분을 현재와 동일하게 유지)
      ...(customAxes.length > 0 ? { customAxes } : {}),
      ...(customOptions.length > 0 ? { customOptions } : {}),
    };
    // 덮으면 뒤에 온 것이 승리하고, Map 이 첫 삽입 순서를 유지하므로 자리는 그대로
    byName.set(brandName, set);
  }
  return [...byName.values()].slice(0, BRAND_CONCEPT_MAX_SETS);
}

// 저장분 JSON 은 형태 보장이 없어 읽는 쪽에서 문자열로 좁힘
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * 선택에 문구 채우기. 출처는 카탈로그와 그 세트의 커스텀 정의이고 어디에도 없는 선택은 폐기
 * key 를 문구 대신 쓰면 `표현 형식: retired-option` 같은 줄이 그대로 모델에 전달됨
 */
function withConceptText(c: ConceptChoice, resolve: ConceptResolver): ConceptSelection | null {
  const resolved = resolve(c.axis, c.option);
  if (!resolved) return null;
  return {
    ...c,
    label: resolved.label,
    note: resolved.note,
    // 커스텀 축만 이름을 실음. 없으면 프롬프트의 축 이름 자리에 raw key 노출
    ...(resolved.axisLabel ? { axisLabel: resolved.axisLabel } : {}),
  };
}

/**
 * 저장 전 검증. 정규화가 커스텀 고아를 이미 버려 여기서 걸리는 것은 기본 축과 옵션의 오타
 * 클라이언트 버그라 조용히 버리지 않고 세움
 */
function assertKnownConcepts(sets: BrandConceptSetInput[]): void {
  for (const set of sets) {
    const resolve = createConceptResolver(set);
    for (const c of set.concepts) {
      if (!resolve(c.axis, c.option)) {
        throw new BadRequestException(
          `선택지에 없는 컨셉입니다: ${c.axis}/${c.option}`,
        );
      }
    }
  }
}

/**
 * 저장분에서 그 버전의 세트 추출(저장 형태 그대로, 문구 미해석)
 *
 * 버전 맵이 현재 형태이고 최상위 `sets` 는 버전 이전 형태(이관 오독 대비 그물)
 * 문구를 풀면 사라진 선택이 폐기돼, 세트 하나만 고치는 저장이 다른 세트의 선택까지 삭제
 */
function parseBrandConceptSetInputs(
  settings: string | null | undefined,
  version: ToolVersion,
): BrandConceptSetInput[] {
  if (!settings) return [];
  try {
    const parsed = JSON.parse(settings) as unknown;
    const root = (parsed ?? {}) as Record<string, unknown>;
    const slot = (root[version] ?? (Array.isArray(root.sets) ? root : null)) as
      | { sets?: unknown }
      | null;
    const raw = slot?.sets;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x) => {
        const o = (x ?? {}) as Record<string, unknown>;
        return {
          brandName: str(o.brandName),
          brandDescription: str(o.brandDescription),
          // 저장분은 선택만 담음. 문구가 함께 있던 시절의 행도 사본은 폐기
          concepts: Array.isArray(o.concepts)
            ? o.concepts.map((c) => {
                const v = (c ?? {}) as Record<string, unknown>;
                return { axis: conceptKey(v.axis), option: conceptKey(v.option) };
              })
            : [],
          customAxes: normalizeCustomAxes(o.customAxes),
          customOptions: normalizeCustomOptions(o.customOptions, normalizeCustomAxes(o.customAxes)),
        };
      })
      .filter((s) => s.brandName.length > 0);
  } catch {
    return [];
  }
}

/** 저장 형태를 조회 형태로 변환(문구를 그 세트의 정의와 카탈로그로 채움) */
function toBrandConceptSets(inputs: BrandConceptSetInput[]): BrandConceptSet[] {
  return inputs.map((s) => {
    const resolve = createConceptResolver(s);
    return {
      brandName: s.brandName,
      brandDescription: s.brandDescription,
      concepts: s.concepts
        .map((c) => withConceptText(c, resolve))
        .filter((c): c is ConceptSelection => c !== null),
      customAxes: s.customAxes ?? [],
      customOptions: s.customOptions ?? [],
    };
  });
}

/** 설정 JSON 문자열에서 편집 지침 추출. 비었거나 파싱 실패면 빈 문자열 */
function parsePlanInstructionsOverride(settings: string | null | undefined): string {
  if (!settings) return '';
  try {
    const o = (JSON.parse(settings) as { instructions?: unknown } | null) ?? {};
    return typeof o.instructions === 'string' ? o.instructions.trim() : '';
  } catch {
    return '';
  }
}

/** AI 모델 선택 정규화(각 필드 트림과 길이컷) */
function normalizeAiModelSelection(sel: AiModelSelection): AiModelSelection {
  const key = (v: unknown): string =>
    (typeof v === 'string' ? v : '').trim().slice(0, AI_MODEL_MAX_LEN);
  return {
    llm: key(sel?.llm),
    video: key(sel?.video),
    videoMode: key(sel?.videoMode),
    tts: key(sel?.tts),
    ttsVoice: key(sel?.ttsVoice),
    ttsPitch: key(sel?.ttsPitch),
    image: key(sel?.image),
  };
}

/**
 * 저장분을 버전별 슬롯 맵으로 읽기. 형태가 깨졌으면 빈 맵
 * 저장 시 맵 전체를 다시 쓰므로 여기서 남은 슬롯 유실 시 다른 버전 선택 소실
 */
function parseVersionSlots(settings: string | null | undefined): Record<string, unknown> {
  if (!settings) return {};
  try {
    const o = JSON.parse(settings) as Record<string, unknown> | null;
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

/** 버전 맵에서 그 버전의 선택 추출. 슬롯이 없으면 빈 선택 */
function parseAiModelSelection(
  settings: string | null | undefined,
  version: ToolVersion,
): AiModelSelection {
  const empty: AiModelSelection = { llm: '', video: '', videoMode: '', tts: '', ttsVoice: '', ttsPitch: '', image: '' };
  const slot = parseVersionSlots(settings)[version];
  if (!slot || typeof slot !== 'object') return empty;
  const o = slot as Record<string, unknown>;
  return {
    llm: str(o.llm),
    video: str(o.video),
    videoMode: str(o.videoMode),
    tts: str(o.tts),
    ttsVoice: str(o.ttsVoice),
    ttsPitch: str(o.ttsPitch),
    image: str(o.image),
  };
}
