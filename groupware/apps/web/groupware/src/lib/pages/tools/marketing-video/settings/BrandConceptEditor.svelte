<script lang="ts">
  // 설정 → 브랜드/컨셉: 내 브랜드/컨셉 세트 편집. 한 세트 = (브랜드명 + 설명 + 축별 연출 방향)
  //
  // 채널을 받지 않는다. 어떤 브랜드를 어떤 연출로 만들지는 만드는 사람의 판단이라 채널을 옮겨도
  // 따라오고, 같은 채널을 함께 쓰는 두 사람이 서로 다른 세트를 가질 수 있다. 그래서 편집 권한
  // 게이트도 없다.
  //
  // 세트를 탭으로 다루는 이유는 컨셉 축이 7개라 세트 카드 하나가 뷰포트 두세 화면이기 때문이다.
  // 활성 세트 하나만 그리면 스크롤 길이가 세트 수와 무관해진다. 탭 행은 스크롤 컨테이너 밖이다.
  // 함께 스크롤되면 세트를 바꾸려고 매번 위로 되돌아가야 한다.
  //
  // 활성 세트를 URL 에 싣지 않는다. 편집 중 배열의 인덱스라 안정 식별자가 없다(브랜드명은 타이핑
  // 중 바뀌고 인덱스는 추가와 삭제로 밀린다). 새로고침하면 스테이징은 사라지는데 URL 만 남아
  // 다른 세트를 가리킨다.
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { marketingChannelsService as svc } from '$lib/features/marketing-channels/services/marketingChannels.service';
  import { sameSets } from '$lib/features/marketing-channels/lib/conceptCategories';
  import type { BrandConceptSetInput } from '$lib/features/marketing-channels/types';
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import BrandConceptSetCard from './BrandConceptSetCard.svelte';

  /**
   * 세트 최대 개수. 필드 길이 제한은 세트 카드가 담당한다.
   *
   * 백엔드 `BRAND_CONCEPT_MAX_SETS` 의 복제다. 이름이 달라 grep 으로 짝이 걸리지 않으므로
   * `scripts/check-brand-concept-limits.mjs` 가 두 값을 비교해 CI 에서 세운다. 여기가 더 크면
   * 21번째 세트를 만들 수 있는데 저장하면 사라진다.
   */
  const MAX_SETS = 20;

  /** 편집 대상 버전. AiModelEditor 와 같은 이유로 상위가 `{#key version}` 으로 감싼다. */
  let { version }: { version: VersionMode } = $props();

  const qc = useQueryClient();
  const bcQuery = createQuery(() => svc.myBrandConceptQueryOptions(version));
  // 선택지 목록은 서버(csc-marketing)가 소유한다. 화면은 받아서 그리기만 한다.
  const catalogQuery = createQuery(() => svc.brandConceptCatalogQueryOptions());
  const axes = $derived(catalogQuery.data ?? []);
  const mut = createMutation(() => svc.setMyBrandConceptMutationOptions(qc, version));

  // 스테이징: null = 서버값 그대로, 배열 = 편집 중
  //
  // 이 화면이 저장하는 것은 브랜드명, 설명, 고른 선택지다. 카테고리/레퍼런스 정의는 관리 모달이
  //   자기 요청으로 저장하므로 하단 바의 저장에 실려도 서버가 무시한다.
  //
  // 그런데도 스테이징이 정의를 들고 있는 이유가 둘이다. 카드가 그것으로 칩 줄을 그리고(없으면 편집
  //   중에 카테고리가 사라져 보인다), 브랜드명을 바꾼 세트는 서버가 새 이름으로 저장된 정의를 찾지
  //   못해 요청이 실어 온 값을 쓴다(없으면 이름을 고치는 순간 카테고리를 잃는다)
  let staged = $state<BrandConceptSetInput[] | null>(null);
  const server = $derived<BrandConceptSetInput[]>(
    (bcQuery.data ?? []).map((s) => ({
      brandName: s.brandName,
      brandDescription: s.brandDescription,
      concepts: s.concepts.map((c) => ({ axis: c.axis, option: c.option })),
      customAxes: s.customAxes,
      customOptions: s.customOptions,
    })),
  );
  const draft = $derived(staged ?? server);
  const dirty = $derived(staged !== null && !sameSets(staged, server));

  /** 활성 세트(배열 인덱스). URL 에 두지 않는 이유는 파일 머리 주석에 있다. */
  let active = $state(0);
  /** 추가 직후 한 번만 브랜드명으로 포커스를 보낸다(탭을 눌러 옮길 때는 빼앗지 않는다) */
  let focusName = $state(false);
  /** 탭을 바꾸면 본문을 맨 위로 되돌린다: 세트는 브랜드명부터 위에서 아래로 읽는다. */
  let bodyEl = $state<HTMLDivElement | null>(null);
  let tabEls = $state<HTMLButtonElement[]>([]);

  const activeSet = $derived(draft[active] ?? null);
  /**
   * 활성 세트가 서버에 저장돼 있는 이름. 저장된 적 없으면 null.
   *
   * 카테고리 정의는 그 이름의 세트 안에 살기 때문에, 이름이 아직 서버에 없으면(새로 추가했거나 이름을
   * 고쳐 둔 세트) 정의를 붙일 자리가 없다. 인덱스로 짝을 맞추지 않는 이유: 추가/삭제로 밀리고, 밀린
   * 짝은 남의 세트에 정의를 붙인다.
   */
  const activeSavedBrandName = $derived(
    activeSet && server.some((s) => s.brandName === activeSet.brandName)
      ? activeSet.brandName
      : null,
  );
  const unnamedCount = $derived(draft.filter((s) => s.brandName.trim() === '').length);
  const ready = $derived(
    !bcQuery.isPending && !catalogQuery.isPending && !bcQuery.isError && !catalogQuery.isError,
  );

  /**
   * 서버 데이터가 줄어들면(저장 시 무명 세트 제거, 버전 전환, 재조회) 활성 인덱스가 배열 밖을
   * 가리킨다. 범위 안으로 되돌린다. 한 번에 조건이 거짓이 되어 수렴한다.
   */
  $effect(() => {
    const last = draft.length - 1;
    if (active > last) active = Math.max(0, last);
  });

  function selectSet(index: number, opts?: { focusName?: boolean }): void {
    active = index;
    focusName = opts?.focusName ?? false;
    bodyEl?.scrollTo({ top: 0 });
  }

  function addSet(): void {
    if (draft.length >= MAX_SETS) return;
    const next = [...draft, { brandName: '', brandDescription: '', concepts: [] }];
    staged = next;
    // 추가한 세트로 바로 옮긴다. 배열 끝에 붙으므로 옮기지 않으면 새 세트가 화면에 나타나지 않는다.
    selectSet(next.length - 1, { focusName: true });
  }
  /** 보이는 세트만 고친다: 활성 세트 외에는 화면에 없으므로 인덱스를 받을 필요가 없다. */
  function editSet(patch: Partial<BrandConceptSetInput>): void {
    staged = draft.map((s, i) => (i === active ? { ...s, ...patch } : s));
  }
  function removeSet(): void {
    const next = draft.filter((_, i) => i !== active);
    staged = next;
    // 지운 자리에는 다음 세트가 들어온다. 마지막을 지웠으면 앞 세트로 간다.
    selectSet(Math.max(0, Math.min(active, next.length - 1)));
  }
  function reset(): void {
    staged = null;
    active = 0;
  }
  function save(): void {
    if (!dirty || mut.isPending) return;
    mut.mutate(draft, { onSuccess: () => (staged = null) });
  }

  /**
   * 탭 좌우/Home/End 이동. 세트가 최대 20개라 Tab 만으로 오가면 본문까지 스무 번을 눌러야 한다.
   *   (2~4개로 고정인 다른 탭 줄에는 없는 문제라 여기만 넣는다)
   *   roving tabindex 는 두지 않는다: 모든 탭이 Tab 으로도 닿는 지금 동작을 그대로 남긴다.
   */
  function onTabKeydown(e: KeyboardEvent, index: number): void {
    const last = draft.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (e.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault();
    selectSet(next);
    tabEls[next]?.focus();
  }

  const saveError = $derived(
    mut.isError ? (mut.error instanceof Error ? mut.error.message : '저장에 실패했습니다.') : null,
  );
</script>

<div class="flex min-h-0 flex-1 flex-col">
  {#if ready}
    <!-- 세트 탭 + 추가: 스크롤 밖에 고정한다(활성 카드가 길어 함께 스크롤되면 매번 위로 올라와야 한다) -->
    <div class="mb-3 flex shrink-0 flex-wrap items-center gap-1.5">
      <div class="flex flex-wrap gap-1.5" role="tablist" aria-label="브랜드/컨셉 세트">
        <!-- 인덱스로 식별한다(unkeyed): 브랜드명으로 키잉하면 타이핑마다 버튼이 리마운트된다. -->
        {#each draft as set, i}
          {@const on = active === i}
          {@const unnamed = set.brandName.trim() === ''}
          <button
            type="button"
            role="tab"
            id={`brand-set-tab-${i}`}
            aria-selected={on}
            aria-controls="brand-set-panel"
            bind:this={tabEls[i]}
            onclick={() => selectSet(i)}
            onkeydown={(e) => onTabKeydown(e, i)}
            title={unnamed ? '브랜드명이 없어 저장되지 않습니다' : set.brandName}
            class="inline-flex max-w-[10rem] items-center rounded-full px-3 py-1 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 {on
              ? 'bg-fg text-surface'
              : 'border border-line text-fg-subtle hover:text-fg'}"
          >
            <!-- min-w-0: inline-flex 자식은 기본 min-width:auto 라 이것 없이는 truncate 가 걸리지 않는다. -->
            <span class="min-w-0 truncate">{unnamed ? `세트 ${i + 1}` : set.brandName}</span>
            {#if unnamed}
              <span class="ml-1 shrink-0 text-[10px] {on ? 'text-surface/70' : 'text-danger-fg'}">
                미저장
              </span>
            {/if}
          </button>
        {/each}
      </div>

      <!-- 세트 추가는 탭이 아니다: tablist 밖에 두고 role 을 주지 않는다(탭이 아닌 자식을 tablist 에
           넣으면 보조기술이 탭 수를 잘못 읽는다). 점선 테두리로 모양도 갈라놓는다. -->
      <button
        type="button"
        onclick={addSet}
        disabled={draft.length >= MAX_SETS}
        title={draft.length >= MAX_SETS
          ? `세트는 최대 ${MAX_SETS}개까지 추가할 수 있습니다`
          : '브랜드/컨셉 세트 추가'}
        class="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1 text-sm text-fg-subtle transition hover:border-fg/40 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 disabled:opacity-50"
      >
        <svg
          class="h-3.5 w-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>세트 추가</span>
      </button>
    </div>
  {/if}

  <!-- 본문(스크롤). pb-4: 스크롤 끝에서 저장 바 구분선에 붙지 않게 -->
  <div
    bind:this={bodyEl}
    class="no-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4"
  >
    {#if bcQuery.isPending || catalogQuery.isPending}
      <p class="rounded-lg border border-dashed border-line px-3 py-8 text-center text-sm text-fg-subtle">
        불러오는 중…
      </p>
    {:else if bcQuery.isError || catalogQuery.isError}
      <p
        class="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-8 text-center text-sm text-danger-fg"
        role="alert"
      >
        브랜드/컨셉을 불러오지 못했습니다.
        <button
          type="button"
          onclick={() => (bcQuery.isError ? bcQuery.refetch() : catalogQuery.refetch())}
          class="rounded-md px-2 py-0.5 text-fg underline decoration-line underline-offset-2 transition hover:decoration-fg"
        >
          다시 시도
        </button>
      </p>
    {:else}
      <p class="text-xs text-fg-subtle">
        브랜드명, 브랜드 설명과 축별 연출 방향을 한 세트로 여러 개 등록할 수 있습니다. 세트 탭으로 오가며
        편집하고 저장은 한 번에 됩니다. 옵션에 마우스를 올리면 감독 노트가 보입니다. 브랜드명이 없는
        세트는 저장되지 않고, 같은 브랜드명이 둘이면 마지막 것만 남습니다.
        이 설정은 나에게만 적용되며 채널을 옮겨도 그대로 따라옵니다.
        지금 보고 있는 도구 버전에만 적용됩니다(버전을 바꾸면 그 버전의 설정이 보입니다).
      </p>

      {#if activeSet === null}
        <p class="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-fg-subtle">
          아직 등록된 브랜드/컨셉 세트가 없습니다. 위 '세트 추가' 버튼을 눌러 시작하세요.
        </p>
      {:else}
        <!-- 활성 세트 하나만 렌더한다. {#key} 로 탭 전환 시 카드를 다시 만든다: 카드 안의 감독 노트
             hover 상태와 삭제 확인 상태가 다른 세트로 새어 나가지 않게 -->
        {#key active}
          <div id="brand-set-panel" role="tabpanel" aria-labelledby={`brand-set-tab-${active}`}>
            <BrandConceptSetCard
              set={activeSet}
              {axes}
              {version}
              savedBrandName={activeSavedBrandName}
              index={active + 1}
              {focusName}
              onChange={editSet}
              onRemove={removeSet}
            />
          </div>
        {/key}
      {/if}
    {/if}
  </div>

  {#if unnamedCount > 0}
    <!-- 탭 뒤에 숨은 무명 세트를 저장 직전에 알린다: 카드가 모두 보일 때는 눈에 띄었다. -->
    <p class="shrink-0 pt-2 text-[11px] text-danger-fg">
      브랜드명이 없는 세트 {unnamedCount}개는 저장되지 않습니다.
    </p>
  {/if}
  {#if saveError}
    <p class="shrink-0 pt-2 text-xs text-danger-fg" role="alert">{saveError}</p>
  {/if}

  <!-- 저장/되돌리기: 개인 설정이라 권한 게이트가 없다(AiModelEditor 와 같이 무조건 렌더) -->
  <div class="shrink-0 flex items-center gap-2 border-t border-line pt-3">
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
