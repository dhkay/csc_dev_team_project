<script lang="ts">
  // 가격표: 마케팅 영상 제작에 실제로 쓰이는 AI 모델의 비용 안내
  //
  // 요금제 판매표가 아니다. 외부 모델은 조직이 등록한 자기 API 키로 호출해 비용이 조직에서 벤더로
  // 직접 청구되고, 내부 모델은 사내 GPU 라 추가 비용이 없다. 그래서 화면의 질문은 어떤 모델을
  // 고르면 어디에 얼마가 나가나다.
  //
  // 표시 대상 = 이 버전이 쓰는 모델(isAiModelVisible) × MODEL_PRICING × 조직 등록 키.
  // 버전을 함께 보는 이유는 고를 수 없는 모델의 단가가 남으면 설정 화면과 어긋나기 때문이다.
  //
  // 확장 지점: 역량마다 tbody 하나 + 그룹 헤더 행. 모델 추가는 카탈로그 한 줄로 행이 생성된다.
  import { createQuery } from '@tanstack/svelte-query';
  import { pipelineFor } from '@csc/tool-versions';
  import { apiCredentialsService } from '$lib/features/api-credentials/services/apiCredentials.service';
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import {
    accessRouteOf,
    aiModelDefaults,
    routeLabel,
    routeLabelOf,
    visibleAiCapabilities,
    isModelComingSoon,
    visibleAiModelOptions,
    viaPlatform,
    type AiModelOption,
  } from '../aiModelOptions';
  import { DEFAULT_SCENE_COUNT } from '../planComposeOptions';
  import { versionProfile } from '../versionProfile';
  import { findModelPricing, PRICING_AS_OF, type ModelPricing } from '../modelPricing';

  interface Props {
    // 지금 보고 있는 도구 버전. 버전마다 쓰는 모델과 기본 모델이 다르다.
    version: VersionMode;
    // 공용 API 키 등록 권한(루트 권한자). 없으면 등록 화면 링크를 숨기고 안내 문구만 보여준다.
    canManageCredentials?: boolean;
    // 공용 API 키 관리 화면 경로
    credentialsHref?: string;
  }
  let { version, canManageCredentials = false, credentialsHref = '' }: Props = $props();

  /** 이 버전의 역량별 기본 모델("기본" 배지의 출처) */
  const defaults = $derived(aiModelDefaults(version));
  /**
   * 영상을 이루는 조각을 그 버전이 부르는 이름('씬' / '동영상')
   *
   * 아래 호출 횟수가 그 단위마다 늘어나므로, 이름이 틀리면 무엇을 늘리면 비용이 느는지 읽는
   * 사람이 알 수 없다. 두 버전이 같은 것을 다른 이름으로 부른다(versionProfile)
   */
  const unit = $derived(versionProfile(version).segmentUnitLabel);

  /**
   * 모델 1행의 사용 가능 상태
   *  - checking : 조직 키 조회 중(미등록으로 깜빡이지 않게)
   */
  type RowStatus = 'ready' | 'need-key' | 'checking' | 'coming-soon';

  interface Row {
    opt: AiModelOption;
    pricing: ModelPricing | undefined;
    isDefault: boolean;
    status: RowStatus;
  }

  // 조직에 등록된 외부 API 프로바이더(논-시크릿, key 목록만): AiModelEditor 게이팅과 같은 출처
  const configuredQuery = createQuery(() => apiCredentialsService.configuredProvidersOptions());
  const configured = $derived(new Set(configuredQuery.data ?? []));

  function statusOf(o: AiModelOption): RowStatus {
    // 준비중이 키 미등록보다 앞이다: 키를 등록해도 고를 수 없어, 키 안내를 먼저 보여 주면
    //   등록하고 나서야 못 쓴다는 것을 알게 된다.
    if (isModelComingSoon(o)) return 'coming-soon';
    // 내부 모델과 키가 필요 없는 외부 모델(edge-tts)은 항상 사용 가능
    if (o.provider !== 'external' || !o.credentialProvider) return 'ready';
    if (configuredQuery.isPending) return 'checking';
    return configured.has(o.credentialProvider) ? 'ready' : 'need-key';
  }

  // 역량 축도 설정 화면과 같은 판정을 쓴다(visibleAiCapabilities). 한쪽만 걸러 두면 그 버전이
  //   쓰지 않는 단계의 단가가 가격표에만 남아 두 화면이 서로 다른 말을 한다.
  const sections = $derived(
    visibleAiCapabilities(version).map((cap) => ({
      cap,
      rows: visibleAiModelOptions(cap, version).map<Row>((o) => ({
        opt: o,
        pricing: findModelPricing(o.key),
        isDefault: defaults[cap.key] === o.key,
        status: statusOf(o),
      })),
    })).filter((s) => s.rows.length > 0),
  );

  const allRows = $derived(sections.flatMap((s) => s.rows));
  const readyCount = $derived(allRows.filter((r) => r.status === 'ready').length);
  const freeCount = $derived(allRows.filter((r) => r.pricing?.billing === 'none').length);
  /** 정액 단가가 없는(크레딧/플랜) 모델 수. 무료와 섞지 않는다. */
  const meteredCount = $derived(allRows.filter((r) => r.pricing?.billing === 'metered').length);
  const needKeyCount = $derived(allRows.filter((r) => r.status === 'need-key').length);

  /**
   * 공식 가격표 출처: 표에 실제로 나온 모델의 것만 주소별 1회
   *
   * 라벨은 청구하는 곳이다(플랫폼을 거치면 그 플랫폼). 첫 행의 벤더를 그대로 쓰면 여러 모델이 한
   * 주소를 공유할 때 그중 아무나 하나가 대표로 뽑힌다.
   */
  const sources = $derived.by(() => {
    const byUrl = new Map<string, string>();
    for (const r of allRows) {
      const url = r.pricing?.sourceUrl;
      if (url && !byUrl.has(url)) byUrl.set(url, viaPlatform(r.opt) ?? r.opt.vendor);
    }
    return [...byUrl].map(([url, vendor]) => ({ url, vendor }));
  });

  /** 배지 문구 = 경로(플랫폼 경유 / AI 회사 / 사내). 등록 화면과 같은 단어를 쓴다. */
  function providerLabel(o: AiModelOption): string {
    const route = accessRouteOf(o);
    return route ? routeLabel(route) : '';
  }

  /**
   * 이 버전에서 돈을 받는 곳. 모델을 만든 곳이 아니라 조직이 키를 등록해 청구되는 곳이다.
   *
   * 둘이 갈리는 경우가 실제로 있다: Kling/Seedance/Veo 는 만든 곳이 셋이지만 청구는 전부
   * Higgsfield 다. 벤더명을 그대로 적으면 화면이 "비용이 Kling 에서 청구됩니다" 라고 말하는데,
   * 조직은 Kling 계정을 가진 적이 없어 어디를 봐야 할지 알 수 없다.
   */
  const billedBy = $derived([
    ...new Set(
      allRows
        .filter((r) => r.opt.provider === 'external')
        .map((r) => viaPlatform(r.opt) ?? r.opt.vendor),
    ),
  ]);

  /** 이 버전에 내부(사내 GPU) 모델이 있는가. 없으면 그 안내를 그리지 않는다. */
  const hasInternal = $derived(allRows.some((r) => r.opt.provider === 'internal'));

  /** 공개 단가가 한 줄이라도 있는가. 없으면 "표시 단가는 공개 요금" 이라는 하단 문구가 거짓이 된다. */
  const hasPublishedRates = $derived(allRows.some((r) => r.pricing?.billing === 'org-key'));

  /**
   * 영상 한 편에 무엇이 몇 번 나가는가
   *
   * 단가만으로는 한 편이 얼마인지 알 수 없다. 특히 이 버전들의 영상 모델은 크레딧 과금이라 표의
   * 모든 줄이 "요청마다 다름" 이 될 수 있는데, 그때도 호출 횟수는 확정된 사실이다. 씬 수가
   * 곱해지는 자리를 아는 것이 "왜 생각보다 많이 나왔나" 의 답이다.
   *
   * 금액을 지어내지 않는다: 크레딧 단가는 계정 플랜과 요청 파라미터가 정하고 벤더 문서가 계정
   * 견적을 authoritative 로 못박는다.
   */
  /**
   * 이 버전이 기획 앞에서 입력을 정제하는가(파이프라인 표). 그러면 LLM 호출이 하나 더 나간다.
   * 두 칸(씬 입력, 제한사항)을 다 비우면 그 호출은 나가지 않아 "최대" 다.
   */
  const refinesBrief = $derived(pipelineFor(version).briefRefinerLlm !== null);

  const perVideoCalls = $derived(
    sections.map((s) => ({
      label: s.cap.label,
      // 기획(LLM)은 영상 한 편에 한 번(정제하는 버전은 정제 한 번 더), 나머지 역량은
      // 조각(씬/동영상)마다 한 번 나간다.
      perVideo: s.cap.key === 'llm' ? (refinesBrief ? 2 : 1) : DEFAULT_SCENE_COUNT,
      perUnit: s.cap.key !== 'llm',
      // 영상마다 1회가 아닌 LLM 줄만 따로 설명한다. 없으면 "2회" 가 무엇인지 읽을 수 없다.
      detail:
        s.cap.key === 'llm' && refinesBrief
          ? '(기획 1회 + 입력 정제 최대 1회. 정제는 씬 입력이나 제한사항을 적었을 때만 나갑니다)'
          : null,
    })),
  );

  /**
   * 키 없이 쓸 수 있는 기본 모델이 있는 역량. 기본은 조직 키를 요구하지 않는 모델만 될 수 있다는
   * 카탈로그 규칙에서 곧바로 나온다(aiModelOptions 의 AI_MODEL_DEFAULTS 주석)
   *
   * 안내 문구가 이 값에서 파생돼야 하는 이유: 예전 문구는 "기본 모델은 모두 내부 모델이라 키를
   * 등록하지 않아도 제작이 가능합니다" 였는데, 버전마다 기본이 있는 역량이 달라 한쪽에서는
   * 거짓이 된다. 키가 필요한지는 돈이 걸린 안내라 화면이 틀리면 안 된다.
   */
  const keyFreeCapabilityLabels = $derived(
    sections.filter((s) => defaults[s.cap.key] !== undefined).map((s) => s.cap.label),
  );

  const STATUS_TEXT: Record<RowStatus, string> = {
    ready: '사용 가능',
    'need-key': '키 미등록',
    checking: '확인 중',
    'coming-soon': '준비중',
  };
  const STATUS_CLASS: Record<RowStatus, string> = {
    ready: 'bg-success-bg text-success-fg',
    'need-key': 'bg-warning-bg text-warning-fg',
    checking: 'bg-hover text-fg-subtle',
    'coming-soon': 'bg-hover text-fg-subtle',
  };
</script>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
  <header class="flex flex-col gap-1">
    <h1 class="text-lg font-semibold text-fg">가격표</h1>
    <p class="text-sm text-fg-subtle">
      마케팅 영상 제작에서 선택할 수 있는 AI 모델의 비용입니다. 설정에서 고른 모델에 따라 실제
      비용이 달라집니다.
    </p>
  </header>

  <!-- 과금 모델 안내: 이 도구는 우리가 청구하지 않는다(조직 키로 벤더 직접 과금). 오해 방지용 배너 -->
  <div class="flex gap-2 rounded-md border border-line bg-accent-bg px-3 py-2.5 text-xs text-fg-muted">
    <svg
      class="mt-0.5 h-4 w-4 shrink-0 text-accent-fg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
    <div class="flex flex-col gap-1">
      <span>
        <strong class="font-medium text-fg">외부 모델</strong>은 조직이 등록한 API 키로 호출되어 비용이
        {billedBy.join(', ')}에서 조직으로 직접 청구됩니다. 이 화면에서 결제하지 않습니다.
      </span>
      <span>
        <!-- 내부 모델 안내는 그런 모델이 있을 때만 그린다. 없는 버전에서 "사내 GPU 라 추가 비용이
             없습니다" 를 읽으면 무료로 쓸 길이 있는 줄 알게 된다. -->
        {#if hasInternal}
          <strong class="font-medium text-fg">내부(자체) 모델</strong>은 사내 GPU 에서 실행되어 추가
          비용이 없습니다.
        {/if}
        {#if keyFreeCapabilityLabels.length === sections.length}
          모든 단계에 키 없이 쓸 수 있는 기본 모델이 있어, 외부 키를 등록하지 않아도 제작이 가능합니다.
        {:else if keyFreeCapabilityLabels.length > 0}
          {keyFreeCapabilityLabels.join(', ')}에는 키 없이 쓸 수 있는 기본 모델이 있지만, 나머지 단계는
          키를 등록해야 제작할 수 있습니다.
        {:else}
          이 버전은 모든 단계가 조직 API 키를 요구합니다.
        {/if}
      </span>
      {#if meteredCount > 0}
        <!-- 그런 모델이 이 버전에 있을 때만 설명한다(없는 표기를 미리 설명하면 안내가 소음이 된다) -->
        <span>
          <strong class="font-medium text-fg">요청마다 다름</strong>으로 표시된 모델은 크레딧이나 구독
          플랜으로 과금되어 정액 단가가 없습니다. 금액은 각 회사 계정의 청구 내역이 근거입니다.
        </span>
      {/if}
    </div>
  </div>

  <!-- 요약: 실제 카탈로그와 조직 키 등록 상태에서 계산 -->
  <div class="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
    <div class="flex flex-col gap-0.5 rounded-xl border border-line bg-surface p-4">
      <span class="text-xs text-fg-subtle">지금 쓸 수 있는 모델</span>
      <span class="text-xl font-bold tabular-nums text-fg">
        {readyCount}<span class="ml-0.5 text-sm font-medium text-fg-subtle">개</span>
      </span>
    </div>
    <!--
      무료가 하나도 없는 버전에서는 그 타일이 영구히 0개다. 그 자리에 실제로 있는 사실(정액 단가가
        없는 모델 수)을 보여준다. 두 값을 한 타일에 번갈아 넣는 이유: 둘 다 "돈이 어떻게 나가나" 의
        답이고, 그 버전에 없는 쪽은 셀 것이 없다.
    -->
    <div class="flex flex-col gap-0.5 rounded-xl border border-line bg-surface p-4">
      <span class="text-xs text-fg-subtle">
        {freeCount > 0 ? '추가 비용 없는 모델' : '정액 단가가 없는 모델'}
      </span>
      <span class="text-xl font-bold tabular-nums text-fg">
        {freeCount > 0 ? freeCount : meteredCount}<span
          class="ml-0.5 text-sm font-medium text-fg-subtle">개</span
        >
      </span>
    </div>
    <div
      class="flex flex-col gap-0.5 rounded-xl border bg-surface p-4 {needKeyCount > 0
        ? 'border-warning-fg/40'
        : 'border-line'}"
    >
      <span class="text-xs text-fg-subtle">키 등록이 필요한 모델</span>
      <span
        class="text-xl font-bold tabular-nums {needKeyCount > 0 ? 'text-warning-fg' : 'text-fg'}"
      >
        {needKeyCount}<span class="ml-0.5 text-sm font-medium text-fg-subtle">개</span>
      </span>
    </div>
  </div>

  {#if needKeyCount > 0}
    <div
      class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-hover/40 px-3 py-2 text-xs text-fg-muted"
    >
      <span>
        키를 등록하지 않은 외부 모델은 설정에서 선택할 수 없고, 이미 선택돼 있어도 기본(내부) 모델로
        대체됩니다.
      </span>
      {#if canManageCredentials && credentialsHref}
        <a
          href={credentialsHref}
          class="shrink-0 rounded-md border border-line px-2.5 py-1 font-medium text-accent-fg transition hover:bg-hover"
        >
          공용 API 키 등록
        </a>
      {:else}
        <span class="shrink-0 text-fg-subtle">조직 관리자에게 공용 API 키 등록을 요청하세요.</span>
      {/if}
    </div>
  {/if}

  <!--
    영상 한 편에 무엇이 몇 번 나가는가

    표는 단가를 말하고 이 블록은 횟수를 말한다. 둘이 다 있어야 한 편이 얼마인지 가늠이 된다.
      특히 크레딧 과금 모델만 있는 버전에서는 표의 모든 줄이 "요청마다 다름" 이 되는데, 그때도
      호출 횟수는 확정된 사실이라 이 블록이 화면에서 유일하게 남는 숫자가 된다.
  -->
  <div class="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
    <div class="flex flex-col gap-0.5">
      <span class="text-sm font-semibold text-fg">영상 한 편에 나가는 호출</span>
      <p class="text-xs leading-relaxed text-fg-subtle">
        {unit}
        {DEFAULT_SCENE_COUNT}개짜리 영상 하나를 만들 때의 횟수입니다. {unit} 수가 늘면 아래에서
        {unit}마다 도는 항목이 그만큼 늘어납니다.
      </p>
    </div>
    <ul class="flex flex-col gap-1">
      {#each perVideoCalls as call (call.label)}
        <li
          class="flex items-baseline justify-between gap-3 rounded-md bg-hover/50 px-2.5 py-1.5 text-xs"
        >
          <span class="min-w-0 text-fg-muted">{call.label}</span>
          <span class="shrink-0 tabular-nums text-fg">
            {call.perVideo}회
            <span class="ml-1 text-[11px] text-fg-subtle">
              {call.perUnit
                ? `(${unit}마다 1회 × ${DEFAULT_SCENE_COUNT})`
                : (call.detail ?? '(영상마다 1회)')}
            </span>
          </span>
        </li>
      {/each}
    </ul>
    {#if meteredCount > 0}
      <p class="text-[11px] leading-relaxed text-fg-subtle">
        정액 단가가 없는 모델은 이 횟수에 금액을 곱할 수 없습니다. 실제 청구액은 각 회사 계정의 견적과
        청구 내역이 근거입니다.
      </p>
    {/if}
  </div>

  <!-- 모델별 단가 표: 좁은 화면에서는 표만 가로 스크롤(페이지 본문은 가로로 밀리지 않는다) -->
  <div class="overflow-x-auto rounded-xl border border-line bg-surface">
    <table class="w-full min-w-[44rem] border-collapse text-left text-sm">
      <thead class="border-b border-line bg-hover/40 text-xs font-medium text-fg-subtle">
        <tr>
          <th scope="col" class="px-4 py-2.5">모델</th>
          <th scope="col" class="w-28 px-4 py-2.5">제공</th>
          <th scope="col" class="w-64 px-4 py-2.5">단가</th>
          <th scope="col" class="w-24 px-4 py-2.5 text-right">상태</th>
        </tr>
      </thead>

      {#each sections as section (section.cap.key)}
        <tbody class="border-b border-line last:border-b-0">
          <!-- 역량 그룹 헤더: 표를 쪼개지 않고 한 표 안에서 묶는다(열 정렬이 그룹 간에도 유지됨) -->
          <tr class="bg-hover/25">
            <th scope="colgroup" colspan="4" class="px-4 py-2 text-left">
              <span class="text-xs font-semibold text-fg">{section.cap.label}</span>
              <span class="ml-2 text-xs font-normal text-fg-subtle">
                {section.cap.description}
              </span>
            </th>
          </tr>

          {#each section.rows as row (row.opt.key)}
            {@const via = routeLabelOf(row.opt)}
            <tr class="border-t border-line/60 align-top">
              <th scope="row" class="px-4 py-3 font-normal">
                <span class="flex flex-wrap items-center gap-1.5">
                  <span class="font-medium text-fg">{row.opt.label}</span>
                  {#if row.isDefault}
                    <span
                      class="rounded-full border border-line px-1.5 py-0.5 text-[10px] font-medium text-fg-subtle"
                    >
                      기본
                    </span>
                  {/if}
                </span>
                <span class="mt-0.5 block text-xs text-fg-subtle">
                  {row.opt.vendor}{via ? ` (${via})` : ''}
                </span>
                {#if row.pricing?.note}
                  <!-- 단가의 판단 근거(비용 비교, 과금 단위, 주의): 열이 아니라 모델 셀에 붙여
                       "무엇을 고를지" 맥락과 함께 읽히게 한다. -->
                  <p class="mt-1.5 max-w-md text-[11px] leading-relaxed text-fg-subtle">
                    {row.pricing.note}
                  </p>
                {/if}
              </th>

              <td class="px-4 py-3">
                <span
                  class="rounded-full px-1.5 py-0.5 text-[10px] font-medium {row.opt.provider ===
                  'internal'
                    ? 'bg-accent-bg text-accent-fg'
                    : 'bg-hover text-fg-subtle'}"
                >
                  {providerLabel(row.opt)}
                </span>
              </td>

              <td class="px-4 py-3">
                {#if row.pricing}
                  <div class="flex flex-col gap-1">
                    {#each row.pricing.rates as rate (rate.label)}
                      <div class="flex items-baseline justify-between gap-3">
                        <span class="text-xs text-fg-subtle">{rate.label}</span>
                        <span class="whitespace-nowrap text-xs font-medium tabular-nums text-fg">
                          {rate.value}
                        </span>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <span class="text-xs text-fg-subtle">단가 확인 필요</span>
                {/if}
              </td>

              <td class="px-4 py-3 text-right">
                <span
                  class="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium {STATUS_CLASS[
                    row.status
                  ]}"
                >
                  {STATUS_TEXT[row.status]}
                </span>
              </td>
            </tr>
          {/each}
        </tbody>
      {/each}
    </table>
  </div>

  <!-- 각주: 기준일과 벤더 공식 출처. 단가는 벤더가 바꿀 수 있으므로 원본을 함께 건다. -->
  <footer class="flex flex-col gap-1.5 border-t border-line pt-4 text-[11px] text-fg-subtle">
    <!--
      공개 단가가 한 줄이라도 있을 때만 그 이야기를 한다. 전부 크레딧 과금인 버전에서 "표시 단가는
        공개 API 요금" 을 읽으면, 화면에 없는 숫자를 어딘가에서 봤다고 착각하게 된다.
    -->
    {#if hasPublishedRates}
      <p>
        표시 단가는 각 회사가 공개한 API 요금이며 {PRICING_AS_OF} 기준입니다. 금액은 USD 이고 부가세와 환율은
        포함하지 않았습니다. 실제 청구액은 벤더 계정의 사용량 기준이므로 각 회사 콘솔에서 확인하세요.
      </p>
    {:else}
      <p>
        이 버전의 모델은 모두 크레딧이나 구독 플랜으로 과금되어 공개된 정액 단가가 없습니다. 실제
        청구액은 각 회사 계정의 견적과 청구 내역에서 확인하세요.
      </p>
    {/if}
    {#if sources.length > 0}
      <p class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>공식 가격표:</span>
        {#each sources as source (source.url)}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            class="text-accent-fg underline underline-offset-2"
          >
            {source.vendor}
          </a>
        {/each}
      </p>
    {/if}
  </footer>
</div>
