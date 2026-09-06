<script lang="ts">
  // 컨셉 카테고리/레퍼런스 관리 모달
  //
  // 기본으로 제공하는 것은 불변이다. 카탈로그(서버 SSOT)가 주는 카테고리와 선택지는 수정도 삭제도
  // 되지 않는다. 그 값이 전체 영상 구현의 기준이라 개인이 지우면 그 기준을 쓰는 기획서와 영상이
  // 함께 흔들린다. 수정과 삭제는 이 사람이 추가한 것에만 붙는다.
  //
  // 기본 목록을 여기 적지 않고 카탈로그 축(axes)을 그대로 받는다. 손으로 적으면 그 순간부터
  // 복제이고 카탈로그가 바뀔 때 조용히 어긋난다.
  //
  // 저장 범위가 하단 바와 다르다. 하단 바는 세트 목록 전체의 이름과 설명과 선택을 저장하고,
  // 이 모달은 세트 하나의 연출(카테고리와 레퍼런스 정의 + 그중 무엇을 골랐는지)을 저장한다.
  // 그래서 요청이 갈라져 있고 목록 저장이 방금 저장된 정의를 되돌리지 못한다.
  //
  // 자기 초안(draft)을 들고 편집하는 이유는 취소가 이 모달에서 한 일만 버려야 하기 때문이다.
  //
  // 저장 대상은 저장된 브랜드명이다. 아직 저장되지 않은 브랜드에는 붙일 자리가 없어 카드가 버튼을 막는다.
  import { page } from '$app/stores';
  import { createMutation, useQueryClient } from '@tanstack/svelte-query';
  import CenterModal from '$lib/shared/ui/CenterModal.svelte';
  import { marketingChannelsService as svc } from '$lib/features/marketing-channels/services/marketingChannels.service';
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import {
    CUSTOM_AXES_MAX_PER_SET,
    CUSTOM_DESCRIPTION_MAX_LEN,
    CUSTOM_LABEL_MAX_LEN,
    CUSTOM_OPTIONS_MAX_PER_AXIS,
    CUSTOM_OPTIONS_MAX_PER_SET,
    addCustomAxis,
    addCustomOption,
    mergeAxes,
    removeCustomAxis,
    removeCustomOption,
    renameCustomAxis,
    setDetailKey,
    updateCustomOption,
    validateAxisLabel,
    validateOptionLabel,
  } from '$lib/features/marketing-channels/lib/conceptCategories';
  import type {
    BrandConceptAxis,
    BrandConceptSetInput,
    ConceptAxisRef,
  } from '$lib/features/marketing-channels/types';

  interface Props {
    // 표시 여부(bindable)
    open?: boolean;
    // 편집 대상 세트(부모 스테이징의 활성 세트). 열 때 이 값에서 초안 생성
    set: BrandConceptSetInput;
    // 저장 대상(서버에 저장된 브랜드명). 저장된 적 없으면 열리지 않음
    savedBrandName: string;
    // 편집 중인 도구 버전. 이 연출도 버전 슬롯 안에 산다.
    version: VersionMode;
    // 기본 카테고리와 그 선택지(서버 카탈로그). 이 목록은 불변
    axes?: BrandConceptAxis[];
    // 저장 결과를 부모 스테이징에 올린다(표시용). 저장 자체는 이 모달이 이미 했다.
    onSaved: (patch: Partial<BrandConceptSetInput>) => void;
  }
  let {
    open = $bindable(false),
    set,
    savedBrandName,
    version,
    axes = [],
    onSaved,
  }: Props = $props();

  const qc = useQueryClient();
  const mut = createMutation(() => svc.setMyBrandConceptSetMutationOptions(qc, version));
  /** 저장 실패 문구. 다음 저장 시도에 지운다(낡은 에러가 남아 있으면 무엇이 실패인지 모른다) */
  let saveError = $state<string | null>(null);

  const channelName = $derived($page.data.currentChannelName as string | undefined);
  const title = $derived(channelName ? `카테고리 관리(${channelName})` : '카테고리 관리');

  /** 이 모달의 초안. null = 닫혀 있음 */
  let draft = $state<BrandConceptSetInput | null>(null);
  /**
   * 열었을 때의 연출. 여기서 달라진 것이 있을 때만 저장을 연다.
   *
   * prop 을 매번 다시 읽어 비교하지 않는 이유: 열려 있는 동안 부모 값이 갱신되면(재조회 등) 기준이
   * 움직여 사용자가 한 편집이 없어진 것처럼 보임. 기준은 편집을 시작한 시점
   */
  let baseline = $state('');
  /** 좌측 목록의 활성 카테고리 key(기본 축 key 또는 커스텀 축 key) */
  let selectedKey = $state<string | null>(null);
  /** 카테고리 이름 입력값 */
  let axisDraft = $state('');
  /** 인라인 편집 중인 커스텀 카테고리(key)와 그 입력값 */
  let editingAxis = $state<string | null>(null);
  let editingAxisName = $state('');
  /** 삭제 확인 중인 커스텀 카테고리. 레퍼런스와 선택까지 함께 지우므로 한 번 더 확인 */
  let confirmAxis = $state<string | null>(null);
  /** 레퍼런스 입력값. `editingOption` 이 있으면 그 레퍼런스를 고치는 중 */
  let optionName = $state('');
  let optionDescription = $state('');
  let editingOption = $state<string | null>(null);
  /** 설명 패널에 무엇을 보일지: hover/focus 한 레퍼런스 key(없으면 안내) */
  let previewKey = $state<string | null>(null);

  /**
   * 열릴 때 초안을 새로 만들고 닫힐 때 폐기
   *
   * `open` 의 이전 값을 평범한 변수로 들고 비교한다. `draft` 를 읽어 판정하면 이 효과가 자기 쓰기에
   * 다시 반응해 루프가 되기 때문
   */
  let wasOpen = false;
  $effect(() => {
    if (open === wasOpen) return;
    wasOpen = open;
    draft = open ? snapshot(set) : null;
    baseline = open ? setDetailKey(set) : '';
    selectedKey = null;
    axisDraft = '';
    editingAxis = null;
    confirmAxis = null;
    saveError = null;
    resetOptionForm();
  });

  /** 배열까지 새로 만든다. 편집 함수들이 새 객체를 돌려주므로 이 얕은 복사로 충분하다. */
  function snapshot(s: BrandConceptSetInput): BrandConceptSetInput {
    return {
      ...s,
      concepts: [...s.concepts],
      customAxes: [...(s.customAxes ?? [])],
      customOptions: [...(s.customOptions ?? [])],
    };
  }

  /**
   * 레퍼런스 입력을 비운다. 기본적으로 설명 패널의 프리뷰도 함께 지운다.
   *
   * `keepPreview` 는 방금 추가/수정한 항목을 그대로 보여 주려는 한 곳을 위한 것이다. 카테고리를
   * 옮기거나 지웠을 때는 그 축의 레퍼런스가 바뀌므로 프리뷰가 남으면 안 됨
   */
  function resetOptionForm(opts?: { keepPreview?: boolean }): void {
    optionName = '';
    optionDescription = '';
    editingOption = null;
    if (!opts?.keepPreview) previewKey = null;
  }

  /** 저장할 것이 있는가. 이 모달이 저장하는 것(정의 + 선택)만 판정 */
  const dirty = $derived(draft !== null && setDetailKey(draft) !== baseline);

  const rows = $derived(mergeAxes(axes, draft));
  /** 활성 행. 선택이 없거나 사라졌으면 첫 행으로 접는다(오른쪽이 비어 보이지 않게) */
  const active = $derived(rows.find((r) => r.key === selectedKey) ?? rows[0] ?? null);
  const activeOptions = $derived(active?.options ?? []);
  const previewOption = $derived(activeOptions.find((o) => o.key === previewKey) ?? null);

  /** 이 카테고리에서 지금 고른 레퍼런스 key. 고르지 않았으면 '' */
  function selectedOption(axis: ConceptAxisRef): string {
    return draft?.concepts.find((c) => c.axis === axis)?.option ?? '';
  }

  /**
   * 레퍼런스를 고른다. 이미 고른 것을 다시 누르면 해제된다(세트 카드와 같은 조작)
   *
   * 카드와 조작을 같게 두는 이유: 같은 값을 두 화면에서 다루므로, 여기서만 다르게 동작하면 어느 쪽이
   * 무엇을 하는지 다시 배워야 하기 때문
   */
  function pickOption(axis: ConceptAxisRef, option: string): void {
    if (!draft) return;
    const rest = draft.concepts.filter((c) => c.axis !== axis);
    draft = {
      ...draft,
      concepts: option === selectedOption(axis) ? rest : [...rest, { axis, option }],
    };
  }

  const customAxisCount = $derived(draft?.customAxes?.length ?? 0);
  const customOptionCount = $derived(draft?.customOptions?.length ?? 0);
  const activeCustomCount = $derived(activeOptions.filter((o) => o.custom).length);

  /** 카테고리 추가 가능 여부와 막힌 이유(둘을 함께 계산해 버튼과 안내가 어긋나지 않게) */
  const axisError = $derived(
    axisDraft.trim() === '' ? null : validateAxisLabel(axes, draft, axisDraft),
  );
  const axisFull = $derived(customAxisCount >= CUSTOM_AXES_MAX_PER_SET);
  const canAddAxis = $derived(axisDraft.trim() !== '' && axisError === null && !axisFull);

  const optionError = $derived(
    optionName.trim() === ''
      ? null
      : active
        ? validateOptionLabel(rows, active.key, optionName, editingOption ?? undefined)
        : null,
  );
  /** 레퍼런스 상한: 이 카테고리 상한과 세트 전체 상한 중 먼저 걸리는 것. 수정 중에는 미적용 */
  const optionFull = $derived(
    editingOption === null &&
      (activeCustomCount >= CUSTOM_OPTIONS_MAX_PER_AXIS ||
        customOptionCount >= CUSTOM_OPTIONS_MAX_PER_SET),
  );
  const canSubmitOption = $derived(
    !!active && optionName.trim() !== '' && optionError === null && !optionFull,
  );

  function handleAddAxis(): void {
    if (!draft || !canAddAxis) return;
    const before = draft.customAxes ?? [];
    draft = addCustomAxis(draft, axisDraft);
    axisDraft = '';
    // 추가한 카테고리로 바로 이동. 옮기지 않으면 새 항목의 레퍼런스를 넣을 방법이 없음
    const added = (draft.customAxes ?? []).find((a) => !before.some((b) => b.key === a.key));
    if (added) selectedKey = added.key;
    resetOptionForm();
  }

  function startRenameAxis(key: string, label: string): void {
    editingAxis = key;
    editingAxisName = label;
    confirmAxis = null;
  }

  function commitRenameAxis(): void {
    if (!draft || editingAxis === null) return;
    // 어긋난 이름이면 편집 상태 유지. 닫아 버리면 사용자가 무엇이 문제였는지 볼 수 없음
    if (validateAxisLabel(axes, draft, editingAxisName, editingAxis) !== null) return;
    draft = renameCustomAxis(draft, editingAxis, editingAxisName);
    editingAxis = null;
  }

  function handleRemoveAxis(key: string): void {
    if (!draft) return;
    draft = removeCustomAxis(draft, key);
    confirmAxis = null;
    if (selectedKey === key) selectedKey = null;
    resetOptionForm();
  }

  /** 칩을 누르면 그 레퍼런스를 아래 입력으로 불러 고친다(칩 안에서 타이핑하지 않는다) */
  function startEditOption(key: string, label: string, description: string): void {
    editingOption = key;
    optionName = label;
    optionDescription = description;
    previewKey = key;
  }

  function handleSubmitOption(): void {
    if (!draft || !active || !canSubmitOption) return;
    if (editingOption !== null) {
      draft = updateCustomOption(draft, editingOption, {
        label: optionName,
        description: optionDescription,
      });
    } else {
      const before = draft.customOptions ?? [];
      draft = addCustomOption(draft, active.key, optionName, optionDescription);
      const added = (draft.customOptions ?? []).find((o) => !before.some((b) => b.key === o.key));
      previewKey = added?.key ?? null;
    }
    // 방금 다룬 항목은 설명 패널에 그대로 둔다. 무엇이 들어갔는지 바로 확인하는 자리다.
    resetOptionForm({ keepPreview: true });
  }

  function handleRemoveOption(key: string): void {
    if (!draft) return;
    // 카테고리 삭제와 달리 한 번 더 묻지 않는다. 칩 하나는 다시 넣기 쉽고, 잘못 눌렀으면 `취소` 로
    //   이 모달의 편집 전체를 버릴 수 있다. 작은 x 에 2단 확인을 붙이면 정상 사용이 번거로워진다.
    draft = removeCustomOption(draft, key);
    if (editingOption === key) resetOptionForm();
    if (previewKey === key) previewKey = null;
  }

  /**
   * 저장: 이 세트의 연출(정의 + 선택)을 서버로 전송. 브랜드명과 설명, 다른 세트는 대상 아님
   *
   * 저장 결과를 부모에 올리는 것은 표시 때문이다. 서버가 지워진 카테고리를 가리키던 선택을 정리하므로,
   * 화면도 같은 값을 들고 있어야 카드가 없는 칩을 고른 것으로 그리지 않음
   */
  async function handleSave(): Promise<void> {
    if (!draft || !dirty || mut.isPending) return;
    saveError = null;
    const detail = {
      customAxes: draft.customAxes ?? [],
      customOptions: draft.customOptions ?? [],
      concepts: draft.concepts,
    };
    try {
      await mut.mutateAsync({ brandName: savedBrandName, ...detail });
      onSaved(detail);
      open = false;
    } catch (e) {
      saveError = e instanceof Error ? e.message : '카테고리를 저장하지 못했습니다.';
    }
  }

  const FIELD =
    'w-full rounded-md border border-line bg-elevated px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-subtle transition focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15';
  const ADD_BUTTON =
    'self-end rounded-full border border-line px-3 py-1 text-xs text-fg-muted transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-fg-muted';
  const HINT = 'text-[11px] text-fg-subtle';
  const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25';
  /**
   * 좌측 행의 보조 버튼(수정/삭제/확인/취소) 클래스
   *
   * 활성 행은 배경이 반전되므로(bg-fg) 글자색이 갈린다. 다섯 자리에 같은 문자열을 적으면 한 곳만
   * 고쳐질 때 그 버튼만 안 보이게 되는데, 눈으로만 잡히는 종류의 어긋남
   */
  const rowAction = (on: boolean) =>
    `shrink-0 text-xs ${on ? 'text-surface/70 hover:text-surface' : 'text-fg-subtle hover:text-fg'} ${FOCUS_RING}`;
</script>

<CenterModal bind:open {title} size="xl">
  <div class="flex flex-col gap-4">
    <p class="text-sm leading-relaxed text-fg-muted">
      카테고리(표현 형식/무드/톤앤매너 등 기본 {axes.length}종)와 하위 레퍼런스를 추가, 수정, 삭제하고
      어느 것을 쓸지 고를 수 있습니다. 변경은 전체 영상 구현에 영향을 줄 수 있으니 신중히 진행해
      주세요. 기본으로 제공하는 항목은 고를 수는 있지만 수정하거나 삭제할 수 없습니다.
    </p>

    <hr class="border-line" />

    <!-- 좌우 2단. portrait 에서는 세로로 쌓인다(모달이 전체화면이 되어 폭이 좁다) -->
    <div class="grid gap-5 md:grid-cols-[17rem_minmax(0,1fr)]">
      <!-- 좌: 카테고리 -->
      <section class="flex flex-col gap-2" aria-label="카테고리">
        <span class="text-xs font-semibold text-fg-muted">카테고리</span>

        <div class="flex flex-col gap-1.5">
          {#each rows as r (r.key)}
            {@const on = active?.key === r.key}
            <div
              class="flex items-center gap-2 rounded-md px-2.5 py-2 transition {on
                ? 'bg-fg text-surface'
                : 'bg-elevated text-fg hover:bg-hover'}"
            >
              {#if editingAxis === r.key}
                <!-- 인라인 편집: key 는 그대로라 이미 고른 선택이 살아남음 -->
                <input
                  type="text"
                  bind:value={editingAxisName}
                  maxlength={CUSTOM_LABEL_MAX_LEN}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') commitRenameAxis();
                    else if (e.key === 'Escape') editingAxis = null;
                  }}
                  aria-label="카테고리 이름"
                  class="min-w-0 flex-1 rounded border border-line bg-elevated px-1.5 py-0.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-fg/15"
                />
                <button
                  type="button"
                  onclick={commitRenameAxis}
                  class={rowAction(on)}
                >
                  확인
                </button>
                <button
                  type="button"
                  onclick={() => (editingAxis = null)}
                  class={rowAction(on)}
                >
                  취소
                </button>
              {:else}
                <button
                  type="button"
                  onclick={() => {
                    selectedKey = r.key;
                    resetOptionForm();
                  }}
                  aria-pressed={on}
                  class="flex-1 truncate text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
                >
                  {r.label}
                </button>

                <!-- 수정과 삭제는 추가한 카테고리에만 부착. 기본 제공은 불변 -->
                {#if r.custom}
                  {#if confirmAxis === r.key}
                    <!-- 2단 확인: 이 카테고리의 레퍼런스와 그 축의 선택까지 함께 사라진다. -->
                    <button
                      type="button"
                      onclick={() => handleRemoveAxis(r.key)}
                      class="shrink-0 text-xs font-medium {on
                        ? 'text-surface'
                        : 'text-danger-fg'} focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-fg/40"
                      aria-label={`${r.label} 삭제 확인`}
                    >
                      삭제
                    </button>
                    <button
                      type="button"
                      onclick={() => (confirmAxis = null)}
                      class={rowAction(on)}
                      aria-label="삭제 취소"
                    >
                      취소
                    </button>
                  {:else}
                    <button
                      type="button"
                      onclick={() => startRenameAxis(r.key, r.label)}
                      class={rowAction(on)}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onclick={() => (confirmAxis = r.key)}
                      class={rowAction(on)}
                    >
                      삭제
                    </button>
                  {/if}
                {/if}
              {/if}
            </div>
          {/each}
        </div>

        <input
          type="text"
          bind:value={axisDraft}
          maxlength={CUSTOM_LABEL_MAX_LEN}
          placeholder="카테고리 이름 (필수, 중복 불가)"
          aria-invalid={axisError !== null}
          onkeydown={(e) => e.key === 'Enter' && handleAddAxis()}
          class={FIELD}
        />
        {#if axisError}
          <span class={HINT}>{axisError}</span>
        {:else if axisFull}
          <span class={HINT}>카테고리는 {CUSTOM_AXES_MAX_PER_SET}개까지 추가할 수 있습니다.</span>
        {/if}
        <button type="button" onclick={handleAddAxis} disabled={!canAddAxis} class={ADD_BUTTON}>
          + 카테고리 추가
        </button>
      </section>

      <!-- 우: 선택 카테고리의 레퍼런스 -->
      <section class="flex flex-col gap-2.5" aria-label="레퍼런스">
        <div class="flex flex-wrap items-baseline justify-between gap-x-2">
          <span class="text-xs font-semibold text-fg-muted">
            {active ? `${active.label} 레퍼런스` : '레퍼런스'}
          </span>
          <!-- 지금 무엇을 골랐는지 글자로도 적는다. 칩 색만으로 두면 어느 것이 골라진 것인지
               훑어야 알고, 고르지 않은 상태와 구별하기도 어렵다. -->
          <span class="text-[11px] text-fg-subtle">
            {#if active && selectedOption(active.key)}
              선택: {activeOptions.find((o) => o.key === selectedOption(active.key))?.label ??
                '없음'}
            {:else}
              선택 안 함
            {/if}
          </span>
        </div>

        <!-- 칩을 누르면 고르고, 다시 누르면 해제된다(세트 카드와 같은 조작)
             추가한 레퍼런스만 `수정` 과 `x` 를 함께 보유. 기본 제공은 선택만 가능 -->
        <div class="flex flex-wrap items-center gap-1.5">
          {#each activeOptions as o (o.key)}
            {@const on = active ? selectedOption(active.key) === o.key : false}
            {#if o.custom}
              <span
                class="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs {on
                  ? 'bg-fg text-surface'
                  : editingOption === o.key
                    ? 'bg-hover text-fg ring-1 ring-fg/30'
                    : 'bg-hover text-fg'}"
              >
                <!-- 라벨이 버튼이다: hover/focus 로 설명 패널을 바꾼다(세트 카드의 옵션 칩과 같은 관용)
                     span 에 마우스 핸들러를 달면 역할 없는 요소가 상호작용을 갖게 되어 a11y 가 차단 -->
                <button
                  type="button"
                  aria-pressed={on}
                  onclick={() => active && pickOption(active.key, o.key)}
                  onmouseenter={() => (previewKey = o.key)}
                  onfocus={() => (previewKey = o.key)}
                  class="focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
                >
                  {o.label}
                </button>
                <button
                  type="button"
                  onclick={() => startEditOption(o.key, o.label, o.description)}
                  aria-label={`${o.label} 수정`}
                  class="text-[10px] opacity-70 transition hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
                >
                  수정
                </button>
                <button
                  type="button"
                  onclick={() => handleRemoveOption(o.key)}
                  aria-label={`${o.label} 삭제`}
                  class="transition hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
                >
                  &times;
                </button>
              </span>
            {:else}
              <!-- 기본 선택지(불변): 고를 수는 있지만 수정도 삭제도 불가 -->
              <button
                type="button"
                title={o.description}
                aria-pressed={on}
                onclick={() => active && pickOption(active.key, o.key)}
                onmouseenter={() => (previewKey = o.key)}
                onfocus={() => (previewKey = o.key)}
                class="rounded-full px-2.5 py-1 text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 {on
                  ? 'bg-fg text-surface'
                  : 'border border-line bg-elevated text-fg hover:bg-hover'}"
              >
                {o.label}
              </button>
            {/if}
          {/each}
        </div>

        <!-- 설명 패널: hover 한 레퍼런스의 설명. 자리를 늘 잡아 레이아웃 흔들림 방지 -->
        <div
          class="min-h-[3.25rem] rounded-md bg-hover px-2.5 py-2 text-[11px] leading-relaxed text-fg-subtle"
          aria-live="polite"
        >
          {#if previewOption}
            <span class="block font-medium text-fg-muted">{previewOption.label}</span>
            {previewOption.description || '설명이 없습니다.'}
          {:else}
            {active?.description ?? '왼쪽에서 카테고리를 먼저 고르세요.'}
          {/if}
        </div>

        <input
          type="text"
          bind:value={optionName}
          maxlength={CUSTOM_LABEL_MAX_LEN}
          placeholder="이름 입력 (필수, 중복 불가, 공백 저장 불가)"
          aria-invalid={optionError !== null}
          onkeydown={(e) => e.key === 'Enter' && handleSubmitOption()}
          class={FIELD}
        />
        {#if optionError}
          <span class={HINT}>{optionError}</span>
        {:else if optionFull}
          <span class={HINT}>
            레퍼런스는 카테고리당 {CUSTOM_OPTIONS_MAX_PER_AXIS}개, 세트당
            {CUSTOM_OPTIONS_MAX_PER_SET}개까지 추가할 수 있습니다.
          </span>
        {/if}
        <input
          type="text"
          bind:value={optionDescription}
          maxlength={CUSTOM_DESCRIPTION_MAX_LEN}
          placeholder="설명 입력 (선택)"
          class={FIELD}
        />
        <div class="flex items-center justify-end gap-2">
          {#if editingOption !== null}
            <button
              type="button"
              onclick={() => resetOptionForm()}
              class="rounded-full px-3 py-1 text-xs text-fg-subtle transition hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
            >
              편집 취소
            </button>
          {/if}
          <button
            type="button"
            onclick={handleSubmitOption}
            disabled={!canSubmitOption}
            class={ADD_BUTTON}
          >
            {editingOption !== null ? '수정 완료' : '+ 추가'}
          </button>
        </div>
      </section>
    </div>
  </div>

  <!-- 하단 우측: 취소 / 저장. 전폭 버튼(기획서 생성)과 달리 두 선택지가 있어 우측에 모은다.
       이 저장은 이 세트의 연출(카테고리, 레퍼런스, 그리고 무엇을 골랐는지)만 남긴다. 브랜드명과
       설명은 설정 화면 하단 바가 저장 -->
  {#snippet footer()}
    <div class="flex items-center justify-end gap-2">
      <span class="mr-auto text-[11px] {saveError ? 'text-danger-fg' : 'text-fg-subtle'}">
        {saveError ??
          (dirty
            ? '이 브랜드의 카테고리와 선택을 저장합니다. 브랜드명과 설명은 화면 하단에서 저장합니다.'
            : '변경한 내용이 없습니다.')}
      </span>
      <button
        type="button"
        onclick={() => (open = false)}
        disabled={mut.isPending}
        class="rounded-full border border-line px-4 py-2 text-sm text-fg-muted transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        취소
      </button>
      <button
        type="button"
        onclick={handleSave}
        disabled={!dirty || mut.isPending}
        class="rounded-full bg-fg px-5 py-2 text-sm font-medium text-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {mut.isPending ? '저장 중…' : '저장'}
      </button>
    </div>
  {/snippet}
</CenterModal>
