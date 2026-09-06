<script lang="ts">
  // 브랜드/컨셉 선택: 내 세트 중 하나를 고르고, 그 세트의 연출 조합을 이번 생성에만 바꿀 수 있다.
  //
  // 세트는 시작점이다. 같은 브랜드로 무드만 바꿔 여러 번 뽑아 보는 것이 주 용도라, 여기서 바꾸고
  // 세트는 건드리지 않는다. 설정 화면으로 나가 고치게 하면 원래 조합을 잃는다.
  //
  // 축 목록과 선택지는 서버 카탈로그를 따른다(화면이 목록을 갖지 않아 축이 늘어도 이 파일은 그대로).
  // 채널 이름을 붙이지 않는다. 세트는 채널이 아니라 사람에게 붙는다.
  //
  // 카탈로그만 그리면 안 된다. 세트가 스스로 더한 카테고리는 정의가 그 세트 안에 있어 카탈로그에
  // 없다. 빼고 그리면 설정에서 고른 연출이 사라져 보이면서 그 선택을 그대로 실어 보내, 화면과
  // 요청이 갈리는 상태가 된다. 그래서 설정 화면의 세트 카드와 같은 병합을 쓴다.
  import { mergeAxes, type DisplayAxis } from '$lib/features/marketing-channels/lib/conceptCategories';
  import type {
    BrandConceptAxis,
    BrandConceptSet,
    ConceptAxisRef,
    ConceptChoice,
  } from '$lib/features/marketing-channels/types';

  interface Props {
    sets: BrandConceptSet[];
    axes: BrandConceptAxis[];
    // 선택된 브랜드명. 선택 상태는 부모(위저드)가 소유한다.
    selected: string | null;
    onSelect: (brandName: string) => void;
    // 이번 생성에 쓸 축 조합. 세트 조합이 기본값이고, 여기서 바꾼 값이 그대로 생성 요청에 실린다.
    // 부모가 소유하는 이유: 이 값이 곧 요청의 일부라, 모달을 닫고 워크스페이스로 넘어갈 때 함께 간다.
    concepts: ConceptChoice[];
    onChangeConcepts: (next: ConceptChoice[]) => void;
    isPending: boolean;
    isError: boolean;
    onRetry: () => void;
  }
  let {
    sets,
    axes,
    selected,
    onSelect,
    concepts,
    onChangeConcepts,
    isPending,
    isError,
    onRetry,
  }: Props = $props();

  const selectedSet = $derived(sets.find((s) => s.brandName === selected) ?? null);

  /** 그릴 축 목록: 카탈로그의 기본 축 + 고른 세트가 더한 카테고리. 설정 화면의 세트 카드와 같다. */
  const displayAxes = $derived<DisplayAxis[]>(mergeAxes(axes, selectedSet));

  /** 축 → 지금 고른 옵션 key. 고르지 않은 축은 키가 없다. 카탈로그 순서로 그리므로 조회용 맵이 필요하다. */
  const chosen = $derived(new Map(concepts.map((c) => [c.axis, c.option])));

  /**
   * 세트 조합과 다른가. 다를 때만 '세트값으로' 를 띄운다.
   *
   * 축 순서가 아니라 축별 값으로 비교한다: 랜덤은 카탈로그 순서로, 세트는 저장 순서로 담겨 있어
   * 배열을 그대로 비교하면 같은 조합이 다르다고 나온다.
   */
  const differsFromSet = $derived.by(() => {
    if (!selectedSet) return false;
    const base = new Map(selectedSet.concepts.map((c) => [c.axis, c.option]));
    if (base.size !== chosen.size) return true;
    for (const [axis, option] of chosen) {
      if (base.get(axis) !== option) return true;
    }
    return false;
  });

  // 축별 hover/focus 프리뷰 옵션 key(null = 없음 → 선택값 표시). 설정 화면의 세트 카드와 같은 규칙이다.
  let preview = $state<Record<string, string | null>>({});

  /**
   * 축 하나를 고른다. 이미 고른 것을 다시 누르면 해제된다(축 하나를 비우는 것도 연출 결정이다)
   * 그래서 '선택 안 함' 칩을 따로 두지 않는다: 토글 자체가 그 역할을 한다(설정 화면과 같은 조작)
   */
  function pickAxis(axis: ConceptAxisRef, option: string): void {
    const next = concepts.filter((c) => c.axis !== axis);
    if (chosen.get(axis) !== option) next.push({ axis, option });
    // 화면 순서로 정렬해 담는다. 프롬프트에 실리는 순서가 화면 순서와 같아야 작업자가 대조할 수 있다.
    const order = new Map(displayAxes.map((a, i) => [a.key, i]));
    next.sort((a, b) => (order.get(a.axis) ?? 99) - (order.get(b.axis) ?? 99));
    onChangeConcepts(next);
  }

  /** 축 아래 설명 패널 텍스트: 프리뷰(hover) 우선, 없으면 선택값, 둘 다 없으면 축 안내 */
  function axisNote(a: DisplayAxis): string {
    const key = preview[a.key] ?? chosen.get(a.key) ?? '';
    return a.options.find((o) => o.key === key)?.description ?? a.description;
  }

  /**
   * 모든 축을 무작위로 고른다. 세트가 비워 둔 축까지 채운다: 뽑기의 목적이 안 해 본 조합을 보는 것이라,
   * 비운 축을 그대로 두면 매번 같은 자리가 빈다.
   *
   * 화면에 보이는 축을 대상으로 한다. 카탈로그만 돌리면 세트가 더한 카테고리가 매번 비워져, 랜덤을
   * 누르는 것이 그 카테고리를 지우는 일이 된다.
   */
  function randomize(): void {
    onChangeConcepts(
      displayAxes
        .filter((a) => a.options.length > 0)
        .map((a) => ({
          axis: a.key,
          option: a.options[Math.floor(Math.random() * a.options.length)].key,
        })),
    );
  }
</script>

<section class="flex flex-col gap-2">
  <div class="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
    <h3 class="text-sm font-medium text-fg">브랜드/컨셉</h3>
    <span class="text-xs text-fg-subtle">
      연출은 이번 생성에만 바꿉니다. 설정의 세트는 그대로 남습니다
    </span>
  </div>

  {#if isPending}
    <p class="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-fg-subtle">
      불러오는 중…
    </p>
  {:else if isError}
    <p
      class="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-danger-fg"
      role="alert"
    >
      브랜드/컨셉을 불러오지 못했습니다.
      <button
        type="button"
        onclick={onRetry}
        class="rounded-md px-2 py-0.5 text-fg underline decoration-line underline-offset-2 transition hover:decoration-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
      >
        다시 시도
      </button>
    </p>
  {:else if sets.length === 0}
    <p class="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-fg-subtle">
      등록된 브랜드/컨셉이 없습니다. 설정에서 추가하세요.
    </p>
  {:else}
    <!-- 브랜드/컨셉 세트 선택 pill(brandName) -->
    <div class="flex flex-wrap gap-1.5" role="tablist" aria-label="브랜드/컨셉 선택">
      {#each sets as set (set.brandName)}
        <button
          type="button"
          role="tab"
          aria-selected={selected === set.brandName}
          onclick={() => onSelect(set.brandName)}
          class="inline-flex items-center rounded-full px-3 py-1 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 {selected ===
          set.brandName
            ? 'bg-fg text-surface'
            : 'border border-line text-fg-subtle hover:text-fg'}"
        >
          <span class="max-w-[10rem] truncate">{set.brandName}</span>
        </button>
      {/each}
    </div>

    {#if selectedSet}
      <div class="flex flex-col gap-2.5 rounded-xl border border-line bg-elevated px-3 py-2.5">
        {#if selectedSet.brandDescription}
          <p class="text-sm text-fg">{selectedSet.brandDescription}</p>
        {/if}

        <!-- 연출 조합 편집 머리줄: 세트와 다른지 + 되돌리기 + 랜덤. 축별 칩은 그 아래에 이어진다. -->
        <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span class="text-xs font-medium text-fg">연출</span>
          <div class="flex items-center gap-1.5">
            {#if differsFromSet}
              <span class="text-[11px] text-fg-subtle">세트와 다름</span>
              <button
                type="button"
                onclick={() => onChangeConcepts(selectedSet.concepts.map((c) => ({ axis: c.axis, option: c.option })))}
                class="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-fg-subtle transition hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
              >
                세트값으로
              </button>
            {/if}
            <button
              type="button"
              onclick={randomize}
              class="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-fg-subtle transition hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
              title="모든 축을 무작위로 고릅니다"
            >
              랜덤
            </button>
          </div>
        </div>

        <!-- 축별 단일 선택 칩: 설정 화면의 세트 카드와 같은 조작이라 두 화면을 오갈 때 다시 배울 것이 없다.
             고른 칩은 배경으로 구분한다(bg-fg). 다시 누르면 해제 -->
        {#each displayAxes as a (a.key)}
          <div class="flex flex-col gap-1">
            <span class="text-xs font-medium text-fg-muted">{a.label}</span>
            <div class="flex flex-wrap gap-1">
              {#each a.options as o (o.key)}
                {@const on = chosen.get(a.key) === o.key}
                <button
                  type="button"
                  title={o.description}
                  aria-pressed={on}
                  onclick={() => pickAxis(a.key, o.key)}
                  onmouseenter={() => (preview[a.key] = o.key)}
                  onmouseleave={() => (preview[a.key] = null)}
                  onfocus={() => (preview[a.key] = o.key)}
                  onblur={() => (preview[a.key] = null)}
                  class="rounded-full px-2 py-0.5 text-[11px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 {on
                    ? 'bg-fg text-surface'
                    : 'bg-hover text-fg-subtle hover:text-fg'}"
                >
                  {o.label}
                </button>
              {/each}
            </div>
            <!-- 감독 노트: 프롬프트에 그대로 실리는 문장이라 무엇이 나갈지 고를 때 보여야 한다.
                 hover 프리뷰가 있어 min-h 로 레이아웃 점프를 막는다(칩을 훑을 때마다 아래가 밀리지 않게) -->
            <p
              class="min-h-[1.75rem] rounded-md bg-hover px-2 py-1 text-[11px] leading-snug text-fg-subtle"
              aria-live="polite"
            >
              {axisNote(a)}
            </p>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</section>
