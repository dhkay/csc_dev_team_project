<script lang="ts">
  // 포커스 키워드 후보 한 줄: 값 + 선택/해제 + 더보기(수정/삭제)
  // 수정은 이 줄 안에서 입력으로 바뀐다(별도 모달을 열면 목록에서 눈을 떼게 된다)
  // 규칙(중복 차단 등)은 부모가 focusKeyword 모듈로 판정하고, 여기선 실패 문구만 보여준다.
  //   드롭다운 관용(open 상태 + 바깥클릭 닫기 + role=menu)은 ModeDropdown 과 같다.
  //
  // 배지를 두 칸으로 나누는 이유: 성격(수집/생성)과 출처(어느 소스)는 서로 다른 사실이다.
  // 한 칸에 겹쳐 소스 이름만 띄우면 그것이 '수집됐다'는 뜻인지 읽는 사람이 알 수 없고,
  // 옆줄의 '생성' 과 나란히 놓였을 때 둘이 같은 종류의 값처럼 보인다.
  import type { FocusKeywordCandidate } from '$lib/features/marketing-channels/types';

  interface Props {
    candidate: FocusKeywordCandidate;
    selected: boolean;
    // 상한에 닿아 더 고를 수 없는 상태(고른 줄은 해제할 수 있어야 하므로 이 값과 무관)
    selectionFull: boolean;
    onToggle: () => void;
    // 수정 확정: 실패 사유를 돌려주면 이 줄이 편집 상태로 남고 문구를 띄운다.
    onRename: (next: string) => string | null;
    onRemove: () => void;
  }
  let { candidate, selected, selectionFull, onToggle, onRename, onRemove }: Props = $props();

  const value = $derived(candidate.keyword);
  /** 성격: 이 말이 어떻게 생겼는가 */
  const originLabel = $derived(
    candidate.origin === 'collected'
      ? '수집'
      : candidate.origin === 'edited'
        ? '직접 입력'
        : '생성',
  );
  /** 출처: 수집값만 갖는다. 어디서 온 검색어인지가 곧 신뢰의 근거다. */
  const sourceLabel = $derived(
    candidate.origin === 'collected' ? (candidate.source?.label ?? null) : null,
  );
  const searchLabel = $derived(
    typeof candidate.monthlySearches === 'number' && candidate.monthlySearches > 0
      ? `월 ${candidate.monthlySearches.toLocaleString('ko-KR')}회`
      : null,
  );

  let menuOpen = $state(false);
  let editing = $state(false);
  let draft = $state('');
  let error = $state<string | null>(null);
  let container = $state<HTMLElement | null>(null);
  let input = $state<HTMLInputElement | null>(null);

  // 바깥 클릭 시 메뉴 닫기(편집 중에는 입력을 잃지 않도록 메뉴만 닫는다)
  $effect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (container && !container.contains(e.target as Node)) menuOpen = false;
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  });

  // 편집으로 들어가면 커서를 그 자리에 둔다(마우스를 다시 옮기지 않게)
  $effect(() => {
    if (editing) input?.focus();
  });

  function startEdit(): void {
    draft = value;
    error = null;
    editing = true;
    menuOpen = false;
  }
  function cancelEdit(): void {
    editing = false;
    error = null;
  }
  function commitEdit(): void {
    const failure = onRename(draft);
    if (failure) {
      error = failure;
      return;
    }
    editing = false;
    error = null;
  }
</script>

<li class="flex flex-col gap-1 bg-elevated px-3 py-2.5" bind:this={container}>
  <div class="flex items-center gap-2">
    {#if editing}
      <input
        type="text"
        bind:this={input}
        value={draft}
        oninput={(e) => (draft = e.currentTarget.value)}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitEdit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
          }
        }}
        maxlength={100}
        aria-label={`${value} 수정`}
        class="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm text-fg transition focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15"
      />
      <button
        type="button"
        onclick={commitEdit}
        class="shrink-0 rounded-md bg-fg px-2.5 py-1 text-xs font-medium text-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30"
      >
        저장
      </button>
      <button
        type="button"
        onclick={cancelEdit}
        class="shrink-0 rounded-md px-2 py-1 text-xs text-fg-subtle transition hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
      >
        취소
      </button>
    {:else}
      <span
        class="min-w-0 flex-1 truncate text-sm {selected ? 'font-medium text-fg' : 'text-fg-subtle'}"
      >
        {value}
      </span>

      <!-- 성격: 수집만 진하게 둔다(실측이라서) -->
      <span
        class="shrink-0 rounded-full px-2 py-0.5 text-[11px] {candidate.origin === 'collected'
          ? 'bg-accent-bg text-accent-fg'
          : 'bg-hover text-fg-subtle'}"
      >
        {originLabel}
      </span>
      <!-- 출처와 검색량: 넓은 화면에서는 같은 줄에. 좁은 화면은 아래 둘째 줄로 내린다.
           숨기지 않는 이유는 이것이 그 후보를 고를 근거이기 때문이다. 자리가 없으면 옮길 뿐이다. -->
      {#if sourceLabel}
        <span
          class="hidden shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-subtle sm:inline"
        >
          {sourceLabel}
        </span>
      {/if}
      {#if searchLabel}
        <span class="hidden shrink-0 text-[11px] tabular-nums text-fg-subtle sm:inline"
          >{searchLabel}</span
        >
      {/if}

      <button
        type="button"
        onclick={onToggle}
        disabled={!selected && selectionFull}
        aria-pressed={selected}
        class="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 disabled:opacity-40 {selected
          ? 'bg-fg text-surface'
          : 'border border-line text-fg-subtle hover:text-fg'}"
      >
        {selected ? '해제' : '선택'}
      </button>

      <div class="relative shrink-0">
        <button
          type="button"
          onclick={() => (menuOpen = !menuOpen)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`${value} 더보기`}
          class="flex h-6 w-6 items-center justify-center rounded-md text-fg-subtle transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="19" cy="12" r="1.6" />
          </svg>
        </button>

        {#if menuOpen}
          <div
            role="menu"
            class="absolute right-0 top-full z-50 mt-1 flex w-28 flex-col overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onclick={startEdit}
              class="rounded-lg px-2 py-1.5 text-left text-sm text-fg transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
            >
              수정
            </button>
            <button
              type="button"
              role="menuitem"
              onclick={() => {
                menuOpen = false;
                onRemove();
              }}
              class="rounded-lg px-2 py-1.5 text-left text-sm text-danger-fg transition hover:bg-danger-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-fg/40"
            >
              삭제
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- 좁은 화면용 둘째 줄: 위에서 자리가 없어 내려온 출처와 검색량. 키워드를 잘라 내는 대신 줄을 나눈다. -->
  {#if !editing && (sourceLabel || searchLabel)}
    <div class="flex items-center gap-2 sm:hidden">
      {#if sourceLabel}
        <span class="rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-subtle">
          {sourceLabel}
        </span>
      {/if}
      {#if searchLabel}
        <span class="text-[11px] tabular-nums text-fg-subtle">{searchLabel}</span>
      {/if}
    </div>
  {/if}

  {#if error}
    <p class="text-xs text-danger-fg" role="alert">{error}</p>
  {/if}
</li>
