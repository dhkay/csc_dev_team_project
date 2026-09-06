<script lang="ts">
  // 설정 → AI 모델: 내가 쓸 AI 모델을 역량별로 고른다.
  // 구조: 역량(LLM/영상 생성/이미지 생성/TTS) → 제공자(외부/내부) → 회사/브랜드(vendor) → 모델(단일 선택). 저장 값 = 역량별 모델 id.
  // 외부 모델은 조직이 그 회사 API 키(credentialProvider)를 등록해야 선택 가능(미등록이면 비활성)
  //
  // 채널을 받지 않고 권한 게이트도 없다: 이 선택은 내 것이라 채널을 옮겨도 따라오고, 남의 허락이
  //   필요하지 않다(같은 채널을 함께 쓰는 두 사람이 서로 다른 모델을 쓸 수 있다)
  //   조직이 어떤 외부 모델을 쓸 수 있는지는 여전히 조직 API 키가 정한다(게이팅은 그대로)
  // 구성: 스크롤 본문 + 하단 저장/되돌리기 바(변경 스테이징). 탭 헤더는 상위(SettingsSectionsPanel) 담당
  // 화면이 보여주는 값 = 이 버전에서 실제로 쓰일 값(withEffective). 기본이 있는 버전은 고른 적 없어도
  //   그 기본이 선택돼 보이고, 기본이 없는 버전(v1.0)은 빈 채로 두고 생성 시작을 차단
  // 모델 버튼은 고정 최소폭 타일이 가로폭에 따라 자동으로 채워진다(넓게 늘어지지 않음)
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { marketingChannelsService as svc } from '$lib/features/marketing-channels/services/marketingChannels.service';
  import { apiCredentialsService } from '$lib/features/api-credentials/services/apiCredentials.service';
  import type { AiModelSelection } from '$lib/features/marketing-channels/types';
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import {
    accessRouteGroups,
    isModelComingSoon,
    isModelGated,
    resolveRouteTab,
    routeDescription,
    routeLabel,
    routeLabelOf,
    routeTabId,
    vendorsOf,
    visibleAiCapabilities,
    visibleAiModelOptions,
    pinnedModelFor,
    isAiModelVisible,
    findAiModelOption,
    effectiveAiModel,
    EDGE_TTS_MODEL_KEY,
    EDGE_TTS_KO_VOICES,
    EDGE_TTS_PITCHES,
    EDGE_TTS_DEFAULT_VOICE,
    EDGE_TTS_DEFAULT_PITCH,
    WAN_VIDEO_MODEL_KEY,
    WAN_VIDEO_MODES,
    WAN_VIDEO_DEFAULT_MODE,
    aiModelDefaults,
    type AiCapability,
    type AiCapabilityKey,
    type AiModelOption,
  } from '../aiModelOptions';
  import { filterModels, sharedRouteLabel, usesDenseList } from '../aiModelSearch';
  import SearchInput from '$lib/shared/ui/controls/SearchInput.svelte';



  const EMPTY: AiModelSelection = { llm: '', video: '', videoMode: '', tts: '', ttsVoice: '', ttsPitch: '', image: '' };

  /**
   * 편집 대상 버전. 상위(SettingsSectionsPanel)가 `{#key version}` 으로 감싸 버전이 바뀌면 이
   * 컴포넌트가 통째로 리마운트되므로 스테이징 편집이 구조적으로 버려진다.
   * $effect 로 손수 비우면 그 한 줄을 빠뜨렸을 때 다른 버전에서 하던 편집이 이 슬롯에 저장됨
   */
  let { version }: { version: VersionMode } = $props();

  /**
   * 이 버전의 역량별 기본 모델. 버전마다 다르고 없을 수도 있음(v1.0 은 기본 없음)
   * (자체 모델을 쓰지 않기로 했고, 남은 것은 조직 API 키가 있어야 부를 수 있어 "고르지 않아도
   * 이걸로 만들어진다" 고 말할 대상이 없다). 선택지 목록과 같은 카탈로그에서 와 어긋나지 않음
   */
  /**
   * 이 버전의 파이프라인에 있는 역량만 그린다. v1.5 는 씬 이미지를 만들지 않으므로 이미지 섹션이
   * 아예 없다(선택지가 빈 "준비중" 과 다르다. 그건 곧 생긴다는 뜻이라 없는 기능을 기다리게 된다)
   */
  const capabilities = $derived(visibleAiCapabilities(version));

  const defaults = $derived(aiModelDefaults(version));
  /** 이 버전에 기본이 하나라도 있는가: 안내 문구가 갈린다("기본이 선택됨" vs "직접 골라야 함") */
  const hasVersionDefaults = $derived(Object.keys(defaults).length > 0);

  const qc = useQueryClient();
  const modelQuery = createQuery(() => svc.myAiModelQueryOptions(version));
  const mut = createMutation(() => svc.setMyAiModelMutationOptions(qc, version));

  // 조직에 등록된 외부 API 프로바이더(논-시크릿): 외부 모델 게이팅용. 값은 오지 않고 provider key 목록만
  const configuredQuery = createQuery(() => apiCredentialsService.configuredProvidersOptions());
  const configured = $derived(new Set(configuredQuery.data ?? []));


  /**
   * 밀집 목록의 검색어. 역량별로 따로 든다: 한 역량을 검색해 둔 채 다른 역량으로 눈을 옮겼을 때
   * 그쪽 목록까지 걸러지면 사용자는 자기가 걸지 않은 필터 때문에 모델이 없다고 판단
   * Record 가 exhaustive 라 역량을 늘리면 컴파일이 빠진 자리를 포착
   */
  let queries = $state<Record<AiCapabilityKey, string>>({
    llm: '',
    video: '',
    image: '',
    tts: '',
  });

  /**
   * 역량별로 사용자가 고른 경로 탭(빈 값 = 아직 고르지 않음)
   *
   * 실제로 열리는 탭은 이 값이 아니라 `resolveRouteTab` 이 정한다. 여기 드는 것은 사람의 선택뿐이고,
   * 그 선택이 더 이상 없는 묶음을 가리키면(버전 전환, 검색) 그쪽이 되돌린다. 검색어와 같은 이유로
   * 역량마다 따로 든다: 한 역량에서 연 탭이 다른 역량의 목록까지 바꾸면, 사용자는 자기가 하지 않은
   * 전환 때문에 모델이 사라졌다고 오해
   */
  let routeTabs = $state<Record<AiCapabilityKey, string>>({
    llm: '',
    video: '',
    image: '',
    tts: '',
  });
  /** 외부 모델이 요구하는 조직 키(credentialProvider)가 미등록이면 게이팅(표시하되 선택 불가) */
  function isGated(o: AiModelOption): boolean {
    return isModelGated(o, configured);
  }

  /** 그 역량에서 지금 고른 모델(없으면 undefined) */
  function selectedOptionOf(cap: AiCapability): AiModelOption | undefined {
    const key = draft[cap.key];
    return key ? cap.options.find((o) => o.key === key) : undefined;
  }

  /**
   * 저장값 → 이 버전에서 실제로 쓰일 값. 판정은 카탈로그(effectiveAiModel)가 소유한다:
   * 생성 전 점검(aiModelReadiness)이 같은 함수를 보므로, 화면이 골랐다고 보여주는데 생성은
   * 비었다고 막는 상태가 생기지 않음
   *
   *   - 기본이 있는 버전(v1.5): 고른 적 없는 역량도 기본이 선택된 것으로 표시. 그것이 실제로 쓰이는 값
   *   - 기본이 없는 버전(v1.0): 고르지 않았으면 빈 값 그대로 둔다. 있지도 않은 기본을 선택된 것처럼
   *     보이면, 그 화면을 믿고 생성을 눌렀다가 막힌다.
   *
   * 이 버전이 쓰지 않는 모델이 저장돼 있는 경우(v1.0 에 남은 자체 모델)도 빈 값이 된다. 그 상태로
   * 저장하면 낡은 값이 비워지므로 다시 고르는 행위가 정리까지 겸함
   */
  function withEffective(s: AiModelSelection): AiModelSelection {
    return {
      ...s,
      llm: effectiveAiModel('llm', s.llm, version) ?? '',
      video: effectiveAiModel('video', s.video, version) ?? '',
      image: effectiveAiModel('image', s.image, version) ?? '',
      tts: effectiveAiModel('tts', s.tts, version) ?? '',
    };
  }

  /**
   * 저장돼 있지만 이 버전에서는 쓰지 않는 모델의 이름(없으면 null)
   *
   * v1.0 은 자체 모델(Qwen3/Wan/FLUX)을 쓰지 않아 목록에서 감추지만 저장값은 남아 있다.
   * 감추기만 하면 그 역량이 이유 없이 비어 보이므로 무엇이 남아 있는지 밝힌다.
   */
  /**
   * 저장된 선택이 준비중 모델이면 그 라벨. 아니면 null.
   *
   * 낡은 선택(retired)과 갈라 두는 이유: 그쪽은 이 버전이 쓰지 않는 모델이고 이쪽은 이 버전이
   * 쓰지만 아직 열리지 않은 모델이다. 한 문구로 뭉치면 "이 버전에서 사용하지 않습니다" 가 되어,
   * 곧 다시 쓸 모델을 영구히 없어진 것으로 읽게 됨
   */
  function comingSoonSelectionLabel(cap: AiCapabilityKey): string | null {
    const key = server[cap];
    if (!key) return null;
    const opt = findAiModelOption(cap, key);
    return opt && isModelComingSoon(opt) ? opt.label : null;
  }

  function retiredSelectionLabel(cap: AiCapabilityKey): string | null {
    const key = server[cap];
    if (!key) return null;
    const opt = findAiModelOption(cap, key);
    if (opt && isAiModelVisible(opt, version)) return null;
    return opt?.label ?? key;
  }

  // 스테이징: null = 저장값(기본 반영) 그대로, 객체 = 편집 중
  let staged = $state<AiModelSelection | null>(null);

  const server = $derived(modelQuery.data ?? EMPTY);
  // 기준선은 저장값이 아니라 실효값이다. 저장값과 비교하면 화면에 이미 보이는 기본이 '변경'으로 잡혀
  //   들어오자마자 저장 버튼이 켜진다(사용자는 아무것도 건드리지 않았다)
  const effective = $derived(withEffective(server));
  const draft = $derived(staged ?? effective);
  const dirty = $derived(
    staged !== null &&
      (staged.llm !== effective.llm ||
        staged.video !== effective.video ||
        staged.videoMode !== effective.videoMode ||
        staged.tts !== effective.tts ||
        staged.ttsVoice !== effective.ttsVoice ||
        staged.ttsPitch !== effective.ttsPitch ||
        staged.image !== effective.image),
  );

  function select(cap: AiCapability, modelId: string): void {
    // 게이팅된(키 미등록) 외부 모델은 선택 불가. 버튼도 disabled 지만 방어적으로 한 번 더 차단
    const opt = cap.options.find((o) => o.key === modelId);
    if (opt && isGated(opt)) return;
    // 같은 모델 다시 클릭은 무시한다(해제 아님). 무엇으로 만들지는 골라 두는 값이라, 지우는 것이
    //   아니라 바꾸는 것이 이 화면의 동작이다. 그만 쓰려면 다른 모델을 고른다.
    if (draft[cap.key] === modelId) return;
    const next = modelId;
    const patch = { [cap.key]: next } as Partial<AiModelSelection>;
    // edge-tts 를 고르면 음성/피치 기본값을 초기화(비어 있을 때만)
    if (cap.key === 'tts' && next === EDGE_TTS_MODEL_KEY) {
      if (!draft.ttsVoice) patch.ttsVoice = EDGE_TTS_DEFAULT_VOICE;
      if (!draft.ttsPitch) patch.ttsPitch = EDGE_TTS_DEFAULT_PITCH;
    }
    // 자체 영상 모델을 고르면 생성 방식(모드) 기본값을 초기화(비어 있을 때만)
    if (cap.key === 'video' && next === WAN_VIDEO_MODEL_KEY) {
      if (!draft.videoMode) patch.videoMode = WAN_VIDEO_DEFAULT_MODE;
    }
    staged = { ...draft, ...patch };
  }
  /** 필드 직접 변경(음성/피치 드롭다운) */
  function setField(patch: Partial<AiModelSelection>): void {
    staged = { ...draft, ...patch };
  }
  function reset(): void {
    staged = null;
  }
  function save(): void {
    if (!dirty || mut.isPending) return;
    mut.mutate(draft, { onSuccess: () => (staged = null) });
  }

  const saveError = $derived(
    mut.isError ? (mut.error instanceof Error ? mut.error.message : '저장에 실패했습니다.') : null,
  );
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <!-- 본문(스크롤). pb-4: 스크롤 끝에서 저장 바 구분선에 붙지 않게 -->
  <div class="no-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
    {#if modelQuery.isPending}
      <p class="rounded-lg border border-dashed border-line px-3 py-8 text-center text-sm text-fg-subtle">
        불러오는 중…
      </p>
    {:else if modelQuery.isError}
      <p
        class="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-8 text-center text-sm text-danger-fg"
        role="alert"
      >
        AI 모델을 불러오지 못했습니다.
        <button
          type="button"
          onclick={() => modelQuery.refetch()}
          class="rounded-md px-2 py-0.5 text-fg underline decoration-line underline-offset-2 transition hover:decoration-fg"
        >
          다시 시도
        </button>
      </p>
    {:else}
      <p class="text-xs text-fg-subtle">
        역량별로 모델을 하나씩 선택합니다.
        {#if hasVersionDefaults}
          처음에는 기본 모델이 선택되어 있습니다.
        {:else}
          기본 모델은 없습니다. 고르지 않은 모델이 있으면 그 모델을 쓰는 생성은 시작되지 않습니다.
        {/if}
        이 선택은 나에게만 적용되며 채널을 옮겨도 그대로 따라옵니다.
        지금 보고 있는 도구 버전에만 적용됩니다(버전을 바꾸면 그 버전의 선택이 보입니다).
      </p>

      <!-- 역량(LLM/영상 생성/이미지 생성/TTS) 섹션: 이 버전이 쓰는 모델만 노출, 없으면 준비중
           노출 판정(isAiModelVisible)은 카탈로그 소유. 가격표도 같은 판정 사용 -->
      {#each capabilities as cap, ci (cap.key)}
        {#if ci > 0}
          <div class="border-t border-line"></div>
        {/if}
        {@const availableOptions = visibleAiModelOptions(cap, version)}
        {@const pinned = pinnedModelFor(cap, version)}
        {@const pinnedOpt = pinned ? cap.options.find((o) => o.key === pinned) : undefined}
        {@const retiredLabel = retiredSelectionLabel(cap.key)}
        {@const comingSoonLabel = comingSoonSelectionLabel(cap.key)}
        {@const defaultKey = defaults[cap.key]}
        {@const selectedKey = draft[cap.key]}
        {@const selectedGated = !!selectedKey && cap.options.some((o) => o.key === selectedKey && isGated(o))}
        {@const fallbackOpt = defaultKey ? cap.options.find((o) => o.key === defaultKey) : undefined}
        {@const selectedOpt = selectedOptionOf(cap)}
        <section class="flex flex-col gap-2">
          <div>
            <h3 class="text-sm font-medium text-fg">{cap.label}</h3>
            <p class="mt-0.5 text-[11px] text-fg-subtle">{cap.description}</p>
          </div>

          {#if pinnedOpt}
            <!-- 고정 역량: 고를 자리를 주지 않는다. 하나뿐인 선택지를 라디오로 두면 누를 수 있는 것처럼
                 보이고, 실제로는 저장값과 무관하게 서버가 이 모델을 쓴다(pinnedPlanLlm)
                 대신 무엇이 쓰이는지 밝힌다: 고정하기 전에는 그 사실이 화면 어디에도 없었다. -->
            <div class="rounded-md border border-line bg-elevated px-2.5 py-2">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-medium text-fg">{pinnedOpt.label}</span>
                <span class="rounded-full border border-line px-1.5 py-0.5 text-[10px] font-medium text-fg-subtle">
                  고정
                </span>
              </div>
              <p class="mt-1 text-[11px] text-fg-subtle">
                이 버전은 이 모델로 고정되어 있어 고르지 않습니다.
              </p>
              {#if isGated(pinnedOpt)}
                <p class="mt-1 text-[11px] text-warning-fg">
                  {pinnedOpt.vendor} API 키가 등록되지 않아 기획서 생성이 시작되지 않습니다.
                </p>
              {/if}
            </div>
          {:else if comingSoonLabel}
            <!-- 이 버전이 쓰는 모델이지만 벤더 쪽이 아직 열리지 않았다. 그대로 두면 생성이 시작
                 되지 않으므로(effectiveAiModel 이 비운다) 다시 고르라고 안내 -->
            <p class="rounded-md border border-line bg-elevated px-2.5 py-1.5 text-[11px] text-warning-fg">
              전에 고른 모델({comingSoonLabel})은 아직 준비중입니다. 열리기 전까지는 다른 모델을 고르세요.
            </p>
          {:else if retiredLabel}
            <!-- 이 버전에서 쓰지 않는 모델이 저장돼 있다(예: v1.0 의 자체 모델). 감추기만 하면 그
                 역량이 이유 없이 비어 보이므로, 무엇이 남아 있었고 지금 무엇을 해야 하는지 밝힌다. -->
            <p class="rounded-md border border-line bg-elevated px-2.5 py-1.5 text-[11px] text-warning-fg">
              전에 고른 모델({retiredLabel})은 이 버전에서 사용하지 않습니다. 아래에서 다시 고르세요.
            </p>
          {:else if !selectedKey && availableOptions.length > 0}
            <!-- 기본이 없는 버전(v1.0)에서 아직 고르지 않은 역량. 생성은 시작 시점에 막히지만,
                 그때 처음 알게 하면 늦다. 고를 자리 바로 위에서 미리 안내
                 고를 것이 없는 역량(준비중)은 제외. 고르라고 해 놓고 고를 수 없으면 막다른 길 -->
            <p class="rounded-md border border-line bg-elevated px-2.5 py-1.5 text-[11px] text-warning-fg">
              아직 고르지 않았습니다. 이 모델을 쓰는 생성은 고른 뒤에 시작할 수 있습니다.
            </p>
          {/if}

          {#if selectedGated}
            <!-- 기본이 없거나(v1.0) 그 기본도 키가 필요하면, "기본 모델이 사용됩니다" 는 쓸 수 없는
                 대안을 안내하는 말이 됨. 그때는 키 등록만 안내 -->
            {@const usableFallback = fallbackOpt && !isGated(fallbackOpt) ? fallbackOpt : undefined}
            <p class="rounded-md border border-line bg-elevated px-2.5 py-1.5 text-[11px] text-warning-fg">
              {#if usableFallback}
                선택한 모델의 API 키가 등록되지 않았습니다. 기본 모델이 사용됩니다: {usableFallback.label}
              {:else}
                선택한 모델의 API 키가 등록되지 않았습니다. 관리자 시스템 환경설정에서 등록해야 이
                모델로 생성됩니다.
              {/if}
            </p>
          {/if}

          {#if pinnedOpt}
            <!-- 고정 역량은 목록을 그리지 않는다. 위 상자가 무엇이 쓰이는지 이미 말했다. -->
          {:else if availableOptions.length === 0}
            <p class="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-fg-subtle">
              준비중
            </p>
          {:else}
            <!-- 목록은 경로로 먼저 갈린다: 그 회사를 직접 부르는가, 플랫폼을 거치는가, 사내인가
                 고르는 사람에게 실제로 다른 것이 그것이다(등록할 키와 요금이 붙는 계정이 갈린다)
                 같은 모델이 두 경로로 있을 수 있어(Veo 3.1) 이 축이 이름을 구분하는 수단이기도 하다.

                 경로가 둘 이상이면 탭으로 전환한다. 한 번에 한 부류만 보여 목록이 짧아지고, 지금
                 보는 것이 어느 계정에 청구되는지가 화면에 남음. 하나뿐이면 탭을 그리지 않음
                 (전환할 곳이 없는 탭은 누를 수 없는 장식이다)

                 아래 판정은 전부 지금 탭의 목록 기준이다. 사람이 실제로 훑는 것이 그것이라,
                 전체로 재면 화면에 없는 모델까지 세어 검색이 붙거나 요약이 어긋남 -->
            {@const groups = accessRouteGroups(availableOptions)}
            {@const tabbed = groups.length > 1}
            {@const tabId = resolveRouteTab(groups, routeTabs[cap.key], draft[cap.key])}
            {@const openTab = groups.find((g) => routeTabId(g.route) === tabId) ?? groups[0]}
            {@const scope = tabbed ? openTab.options : availableOptions}
            <!-- 선택지가 많을 때만 그 위에 검색과 요약 한 줄을 얹는다. 판정 근거는 버전이 아니라
                 개수다(aiModelSearch 의 DENSE_LIST_THRESHOLD): 버전으로 가르면 다른 버전의 선택지가
                 늘어나는 날 같은 문제가 재발 -->
            {@const dense = usesDenseList(scope)}
            <!-- 공통 경로 표기는 요약 줄이 실제로 그려질 때만 타일에서 뺀다. 개수와 무관하게
                 빼면 요약 줄이 없는 화면에서는 그 사실을 아무 데서도 말하지 않게 됨 -->
            {@const commonVia = dense ? sharedRouteLabel(scope, routeLabelOf) : null}
            {@const allGated = dense && scope.every(isGated)}
            {@const shown = dense ? filterModels(scope, queries[cap.key]) : scope}
            {@const hidden = dense && selectedOpt && !shown.includes(selectedOpt) ? selectedOpt : null}
            {#if tabbed}
              <!-- 지금 고른 모델이 다른 탭에 있으면 그 탭이 열린 채 시작한다(resolveRouteTab)
                   개수를 함께 적는 것은 넘어가 보기 전에 그쪽에 무엇이 있는지 알리기 위해서다. -->
              <div class="flex flex-wrap gap-1" role="tablist" aria-label="{cap.label} 경로">
                {#each groups as g (routeTabId(g.route))}
                  {@const id = routeTabId(g.route)}
                  {@const on = id === tabId}
                  {@const holds = !!draft[cap.key] && g.options.some((o) => o.key === draft[cap.key])}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={on}
                    title={g.route ? routeDescription(g.route) : ''}
                    onclick={() => (routeTabs[cap.key] = id)}
                    class="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 {on
                      ? 'border-fg bg-elevated text-fg'
                      : 'border-line text-fg-subtle hover:bg-hover'}"
                  >
                    <span>{g.route ? routeLabel(g.route) : '분류되지 않은 모델'}</span>
                    <span class="text-fg-subtle">{g.options.length}</span>
                    {#if holds && !on}
                      <!-- 고른 모델이 이 탭에 있음. 없으면 눌러 보고서야 어디 있는지 알게 됨 -->
                      <span class="h-1.5 w-1.5 rounded-full bg-fg" title="지금 고른 모델이 있습니다"></span>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
            {#if dense}
              <!-- 모든 모델에 해당하는 사실은 타일마다 반복하지 않고 여기서 한 번만 표시
                   고른 모델이 검색에 걸리지 않아 격자에서 사라졌을 때만 그 사실을 덧붙인다:
                   그러지 않으면 강조된 타일이 없어 아무것도 고르지 않은 화면처럼 보인다. -->
              {@const summary = [
                commonVia,
                `모델 ${scope.length}개`,
                hidden ? `지금 선택: ${hidden.label} (검색 결과에 없음)` : null,
              ]
                .filter((part) => part !== null)
                .join(', ')}
              <p class="text-[11px] text-fg-subtle">{summary}</p>

              {#if allGated}
                <!-- 전부 같은 이유로 막혀 있음. 타일마다 붙이면 같은 안내가 모델 수만큼 반복 -->
                <p class="rounded-md border border-line bg-elevated px-2.5 py-1.5 text-[11px] text-warning-fg">
                  {commonVia ?? '이 모델들'}의 API 키가 등록되지 않아 아직 고를 수 없습니다. 관리자
                  시스템 환경설정에서 등록하세요.
                </p>
              {/if}

              <SearchInput bind:value={queries[cap.key]} placeholder="모델 검색" class="w-full" />

              {#if shown.length === 0}
                <p class="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-fg-subtle">
                  일치하는 모델이 없습니다.
                </p>
              {/if}
            {/if}
            {#each accessRouteGroups(shown) as group (routeTabId(group.route))}
              {#if group.options.length > 0}
              <div class="flex flex-col gap-2">
                {#if !tabbed}
                  <!-- 탭이 없으면 무엇인지 말할 자리가 여기뿐이다(탭이 있으면 탭이 이미 말했다)
                       머리글은 등록 화면과 같은 단어를 쓴다(같은 것을 두 이름으로 배우지 않게) -->
                  <span class="text-[11px] font-medium text-fg-subtle" title={group.route ? routeDescription(group.route) : ''}>
                    {group.route ? routeLabel(group.route) : '분류되지 않은 모델'}
                  </span>
                {/if}
                <!-- 회사/브랜드(vendor)로 한 단계 더 묶음. 벤더가 늘어도 그룹 유지 -->
                {#each vendorsOf(group.options) as vendor (vendor)}
                  {@const opts = group.options.filter((o) => o.vendor === vendor)}
                  <div class="flex flex-col gap-1.5 border-l border-line pl-2.5">
                    <span class="text-[11px] text-fg-subtle">{vendor}</span>
                    <!-- 모델 카드: 고정 최소폭 타일이 가로폭에 따라 자동으로 열 수를 조정한다(auto-fill) -->
                    <div class="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
                      {#each opts as o (o.key)}
                        {@const on = draft[cap.key] === o.key}
                        {@const gated = isGated(o)}
                        {@const soon = isModelComingSoon(o)}
                        {@const via = commonVia ? null : routeLabelOf(o)}
                        <button
                          type="button"
                          disabled={gated || soon}
                          aria-pressed={on}
                          title={soon
                            ? `${o.description}: ${o.comingSoon}`
                            : gated
                              ? `${o.description}: API 키 미등록으로 선택할 수 없습니다`
                              : o.description}
                          onclick={() => select(cap, o.key)}
                          class="flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 disabled:opacity-50 {on
                            ? 'border-fg bg-success-bg'
                            : 'border-line bg-elevated hover:bg-hover'}"
                        >
                          <span
                            class="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border {on
                              ? 'border-fg'
                              : 'border-line'}"
                          >
                            {#if on}<span class="h-1.5 w-1.5 rounded-full bg-fg"></span>{/if}
                          </span>
                          <span class="min-w-0">
                            <span class="flex items-center gap-1.5">
                              <span class="truncate text-sm font-medium text-fg">{o.label}</span>
                              {#if soon}
                                <!-- 배지를 라벨 옆에 둔다: 설명 아래에만 두면 타일을 훑을 때
                                     고를 수 없는 것을 못 보고 눌러 보게 됨 -->
                                <span class="shrink-0 rounded bg-hover px-1 text-[10px] font-medium text-fg-subtle">준비중</span>
                              {:else if defaultKey === o.key}
                                <span class="shrink-0 rounded bg-hover px-1 text-[10px] font-medium text-fg-subtle">기본</span>
                              {/if}
                            </span>
                            <span class="mt-0.5 block text-[11px] leading-snug text-fg-subtle">{o.description}</span>
                            {#if via}
                              <!-- 만든 회사와 돈을 내는 곳이 다르다. 목록 전체가 같은 플랫폼을 거칠
                                   때는 위에서 한 번 말했으므로(commonVia) 여기서는 생략 -->
                              <span class="mt-0.5 block text-[11px] text-fg-subtle">{via}</span>
                            {/if}
                            {#if soon}
                              <!-- 조직이 할 수 있는 일이 없어(벤더 사정) 행동을 요구하지 않음
                                   키 미등록 안내와 문형이 다른 이유가 그것 -->
                              <span class="mt-1 block text-[11px] text-fg-subtle">{o.comingSoon}</span>
                            {:else if gated && !allGated}
                              <span class="mt-1 block text-[11px] font-medium text-warning-fg">
                                API 키 미등록: 관리자 시스템 환경설정에서 등록
                              </span>
                            {/if}
                          </span>
                        </button>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
              {/if}
            {/each}
            {#if cap.key === 'video' && draft.video === WAN_VIDEO_MODEL_KEY}
              <!-- 자체 영상 생성 방식(모드): 한 모델이 텍스트/이미지/텍스트+이미지 생성을 다 지원
                   모델 카드와 구분되도록 배경(bg-hover)을 달리해 "선택한 모델의 하위 옵션"임을 드러낸다.
                   지금은 어느 버전에서도 렌더되지 않는다: 자체 Wan 이 카탈로그에서 노출 중단
                   (RETIRED_FROM_ALL_VERSIONS)이라 draft.video 가 그 key 가 될 수 없다. 그 모델을
                   되살리면 그대로 다시 뜬다(배선을 남긴 이유와 같다) -->
              <div class="flex flex-col gap-1.5 rounded-lg border border-line bg-hover px-3 py-2.5">
                <span class="text-[11px] font-medium text-fg-subtle">생성 방식</span>
                <div class="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
                  {#each WAN_VIDEO_MODES as m (m.key)}
                    {@const on = (draft.videoMode || WAN_VIDEO_DEFAULT_MODE) === m.key}
                    <button
                      type="button"
                      aria-pressed={on}
                      title={m.description}
                      onclick={() => setField({ videoMode: m.key })}
                      class="flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 disabled:opacity-50 {on
                        ? 'border-fg bg-success-bg'
                        : 'border-line bg-elevated hover:bg-hover'}"
                    >
                      <span
                        class="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border {on
                          ? 'border-fg'
                          : 'border-line'}"
                      >
                        {#if on}<span class="h-1.5 w-1.5 rounded-full bg-fg"></span>{/if}
                      </span>
                      <span class="min-w-0">
                        <span class="flex items-center gap-1.5">
                          <span class="truncate text-sm font-medium text-fg">{m.label}</span>
                          {#if m.key === WAN_VIDEO_DEFAULT_MODE}
                            <span class="shrink-0 rounded bg-hover px-1 text-[10px] font-medium text-fg-subtle">기본</span>
                          {/if}
                        </span>
                        <span class="mt-0.5 block text-[11px] leading-snug text-fg-subtle">{m.description}</span>
                      </span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
            <!-- ElevenLabs 음성(voice id)은 여기가 아니라 조직 API 등록에 있다. 미등록은 위 타일의
                 게이팅이 그대로 덮으므로 이 화면에 음성 전용 상태가 없다(이유: aiModelOptions.ts) -->
            {#if cap.key === 'tts' && draft.tts === EDGE_TTS_MODEL_KEY}
              <!-- edge-tts 음성/피치: 작은 드롭다운(음성은 한국어만) -->
              <div class="flex flex-wrap gap-3 rounded-lg border border-line bg-elevated px-3 py-2.5">
                <label class="flex min-w-[8rem] flex-1 flex-col gap-1">
                  <span class="text-[11px] font-medium text-fg-subtle">음성 (한국어)</span>
                  <select
                    value={draft.ttsVoice || EDGE_TTS_DEFAULT_VOICE}
                    onchange={(e) => setField({ ttsVoice: e.currentTarget.value })}
                    class="rounded-md border border-line bg-elevated px-2 py-1 text-xs text-fg transition focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15 disabled:opacity-50"
                  >
                    {#each EDGE_TTS_KO_VOICES as v (v.key)}
                      <option value={v.key}>{v.label}</option>
                    {/each}
                  </select>
                </label>
                <label class="flex min-w-[8rem] flex-1 flex-col gap-1">
                  <span class="text-[11px] font-medium text-fg-subtle">피치</span>
                  <select
                    value={draft.ttsPitch || EDGE_TTS_DEFAULT_PITCH}
                    onchange={(e) => setField({ ttsPitch: e.currentTarget.value })}
                    class="rounded-md border border-line bg-elevated px-2 py-1 text-xs text-fg transition focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15 disabled:opacity-50"
                  >
                    {#each EDGE_TTS_PITCHES as p (p.key)}
                      <option value={p.key}>{p.label}</option>
                    {/each}
                  </select>
                </label>
              </div>
            {/if}
          {/if}
        </section>
      {/each}
    {/if}
  </div>

  {#if saveError}
    <p class="shrink-0 pt-2 text-xs text-danger-fg" role="alert">{saveError}</p>
  {/if}

  <!-- 저장/되돌리기: 항상 렌더해 자리 확보(변경 없으면 버튼 비활성) -->
  <div
    class="shrink-0 flex items-center gap-2 border-t border-line pt-3"
  >
    <span class="mr-auto text-xs text-fg-subtle">
      {dirty ? '저장하지 않은 변경' : '변경 사항 없음'}
    </span>
    <button
      type="button"
      onclick={reset}
      disabled={!dirty || mut.isPending}
      class="rounded-lg px-3 py-1.5 text-sm font-medium text-fg-subtle transition hover:bg-hover hover:text-fg disabled:opacity-50"
    >
      되돌리기
    </button>
    <button
      type="button"
      onclick={save}
      disabled={!dirty || mut.isPending}
      class="rounded-lg bg-fg px-3 py-1.5 text-sm font-medium text-surface transition hover:opacity-90 disabled:opacity-50"
    >
      {mut.isPending ? '저장 중…' : '저장'}
    </button>
  </div>
</div>
