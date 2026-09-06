<script lang="ts">
  // 영상 생성 방식: 이번 생성에 쓸 영상 모델을 고른다.
  //
  // 설정에 저장된 모델이 시작점이다. 한 번만 다른 것으로 시도하려고 설정 화면으로 나가 바꾸고
  // 돌아오면 원래 선택을 잃는다. 그래서 여기서 바꾸고 설정은 건드리지 않는다.
  //
  // 저장값을 못 읽는 동안 빈 목록을 보여 주면 사람이 설정이 비었나 하고 다시 고르는데, 그 선택이
  // 곧 임시 변경이 된다.
  //
  // 조직 키가 없는 모델은 고를 수 없게 하되 감추지 않는다. 왜 못 쓰는지 모르면 등록하러 갈 수 없다.
  //
  // 목록은 경로로 갈라 보여 준다. 같은 모델이 두 경로로 있을 수 있고 그때 이름만 보면 무엇을
  // 고르는지 알 수 없다. 갈리는 것은 등록해야 하는 키와 요금이 붙는 계정이다.
  import {
    accessRouteGroups,
    credentialLabelOf,
    isModelComingSoon,
    isModelGated,
    resolveRouteTab,
    routeDescription,
    routeLabel,
    routeLabelOf,
    routeTabId,
    type AiModelOption,
  } from '../aiModelOptions';

  interface Props {
    // 고를 수 있는 모델(그 버전의 카탈로그 순서)
    options: AiModelOption[];
    // 지금 고른 모델 key. 빈 문자열 = 아직 정해지지 않음(로딩 중이거나 설정이 비었다)
    value: string;
    onSelect: (key: string) => void;
    // 설정에 저장된 모델 key. 이 값과 다르면 '이번 생성만' 임을 알린다.
    savedValue: string;
    // 조직이 등록한 자격증명 provider key 집합. 없는 키를 요구하는 모델은 고를 수 없다.
    configured: Set<string>;
    // 저장값을 아직 읽는 중
    isPending: boolean;
  }
  let { options, value, onSelect, savedValue, configured, isPending }: Props = $props();

  /** 조직 키가 없어 고를 수 없는 모델인가(설정 화면과 같은 판정: 카탈로그가 소유한다) */
  function isGated(o: AiModelOption): boolean {
    return isModelGated(o, configured);
  }


  /**
   * 사용자가 고른 경로 탭(빈 값 = 아직 고르지 않음). 실제로 열리는 탭은 `resolveRouteTab` 이 정한다.
   *
   * 초기값을 첫 탭으로 두지 않는 이유: 저장된 모델이 다른 탭에 있으면 강조된 타일이 없어 아무것도
   * 고르지 않은 화면처럼 보이고, 그러면 사람이 다시 고른다(그 선택이 곧 이번 생성만의 변경이 된다)
   */
  let pickedTab = $state('');
  const groups = $derived(accessRouteGroups(options));
  const tabbed = $derived(groups.length > 1);
  const tabId = $derived(resolveRouteTab(groups, pickedTab, value || savedValue));
  const openTab = $derived(groups.find((g) => routeTabId(g.route) === tabId) ?? groups[0]);
  /** 지금 그릴 목록. 탭이 없으면 전체다. */
  const shown = $derived(tabbed ? (openTab?.options ?? []) : options);

  /** 저장값과 달라졌는가. 저장값을 모르는 동안에는 판단하지 않는다(모르는 것을 변경이라 하지 않는다) */
  const changed = $derived(!isPending && !!savedValue && value !== savedValue);
  const savedLabel = $derived(options.find((o) => o.key === savedValue)?.label ?? savedValue);
</script>

<section class="flex flex-col gap-2">
  <div class="flex flex-wrap items-baseline justify-between gap-2">
    <h4 class="text-sm font-semibold text-fg">영상 생성 방식</h4>
    {#if changed}
      <!-- 되돌리기를 함께 둔다. 바꿔 본 뒤 원래대로 돌아갈 길이 없으면 설정 화면을 다시 열게 된다. -->
      <div class="flex items-center gap-2 text-xs">
        <span class="text-fg-subtle">이번 생성만 변경됨</span>
        <button
          type="button"
          onclick={() => onSelect(savedValue)}
          class="rounded-lg border border-line px-2 py-0.5 font-medium text-fg transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
          title={`설정에 저장된 모델(${savedLabel})로 되돌립니다`}
        >
          저장값으로
        </button>
      </div>
    {/if}
  </div>

  {#if isPending}
    <p class="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-fg-subtle">
      불러오는 중…
    </p>
  {:else if options.length === 0}
    <p class="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-fg-subtle">
      이 버전에서 고를 수 있는 영상 모델이 없습니다.
    </p>
  {:else}
    {#if tabbed}
      <!-- 탭. 개수를 함께 적는 것은 넘어가 보기 전에 그쪽에 무엇이 있는지 알리기 위해서다.
           저장값이 다른 탭에 있으면 점으로 표시한다(눌러 보고서야 알게 되지 않도록) -->
      <div class="flex flex-wrap gap-1" role="tablist" aria-label="영상 생성 방식 경로">
        {#each groups as g (routeTabId(g.route))}
          {@const id = routeTabId(g.route)}
          {@const on = id === tabId}
          {@const holds = !!value && g.options.some((o) => o.key === value)}
          <button
            type="button"
            role="tab"
            aria-selected={on}
            title={g.route ? routeDescription(g.route) : ''}
            onclick={() => (pickedTab = id)}
            class="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 {on
              ? 'border-fg bg-elevated text-fg'
              : 'border-line text-fg-subtle hover:bg-hover'}"
          >
            <span>{g.route ? routeLabel(g.route) : '분류되지 않은 모델'}</span>
            <span class="text-fg-subtle">{g.options.length}</span>
            {#if holds && !on}
              <span class="h-1.5 w-1.5 rounded-full bg-fg" title="지금 고른 모델이 있습니다"></span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
    {#each accessRouteGroups(shown) as group (routeTabId(group.route))}
    <div class="flex flex-col gap-1.5">
      {#if !tabbed}
        <!-- 탭이 없으면 무엇인지 말할 자리가 여기뿐이다(탭이 있으면 탭이 이미 말했다) -->
        <span
          class="text-[11px] font-medium text-fg-subtle"
          title={group.route ? routeDescription(group.route) : ''}
        >
          {group.route ? routeLabel(group.route) : '분류되지 않은 모델'}
        </span>
      {/if}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
      {#each group.options as opt (opt.key)}
        {@const on = value === opt.key}
        {@const gated = isGated(opt)}
        {@const soon = isModelComingSoon(opt)}
        {@const via = routeLabelOf(opt)}
        <button
          type="button"
          aria-pressed={on}
          disabled={gated || soon}
          onclick={() => onSelect(opt.key)}
          class="flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 disabled:cursor-not-allowed disabled:opacity-50 {on
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
              <span class="truncate text-sm font-medium text-fg">{opt.label}</span>
              {#if soon}
                <span class="shrink-0 rounded bg-hover px-1 text-[10px] font-medium text-fg-subtle">준비중</span>
              {/if}
              {#if opt.key === savedValue}
                <span class="shrink-0 rounded bg-hover px-1 text-[10px] font-medium text-fg-subtle">
                  저장값
                </span>
              {/if}
            </span>
            <span class="mt-0.5 block text-[11px] leading-snug text-fg-subtle">{opt.description}</span>
            {#if soon}
              <!-- 벤더 사정이라 조직이 할 수 있는 일이 없다. 사실만 적는다. -->
              <span class="mt-0.5 block text-[11px] text-fg-subtle">{opt.comingSoon}</span>
            {:else if gated}
              <!-- 등록 화면에서 찾아야 하는 항목 이름을 적는다(경로 표기가 아니다) -->
              <span class="mt-0.5 block text-[11px] text-warning-fg">
                {credentialLabelOf(opt) ?? opt.vendor} 키가 등록되지 않아 고를 수 없습니다
              </span>
            {:else if via}
              <span class="mt-0.5 block text-[11px] text-fg-subtle">{via}</span>
            {/if}
          </span>
        </button>
      {/each}
      </div>
    </div>
    {/each}
  {/if}
</section>
