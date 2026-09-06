<script lang="ts">
  // 정보(i) 버튼 + 팝오버: 타일/카드 우상단, 선택 토글(SelectToggle, right-1) 왼쪽(right-8)에 스스로 절대배치된다.
  //   SelectToggle 과 같은 규약: 부모 컨테이너가 relative 여야 하고, 팝오버가 잘리지 않으려면 그 부모가 overflow-hidden 이 아니어야 한다.
  //   확장형: items 로 임의의 라벨/값 행을 받는다(지금은 생성 AI, 추후 생성시각/화면비/렌더시간 등 추가 가능: 컴포넌트 변경 불필요)
  interface InfoItem {
    label: string;
    value: string;
  }
  interface Props {
    items: InfoItem[];
    // 팝오버 제목
    title?: string;
    // 버튼 aria-label.
    ariaLabel?: string;
  }
  let { items, title = '생성 정보', ariaLabel = '생성 정보 보기' }: Props = $props();

  let open = $state(false);
  let root = $state<HTMLDivElement>();

  // 바깥 클릭 / Esc 로 닫기: 열려 있을 때만 리스너를 붙였다 뗀다(그리드에 팝오버가 여러 개여도 상시 리스너가 쌓이지 않음)
  $effect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (root && !root.contains(e.target as Node)) open = false;
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') open = false;
    };
    window.addEventListener('click', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<div bind:this={root} class="absolute right-8 top-1 z-40">
  <button
    type="button"
    aria-label={ariaLabel}
    aria-expanded={open}
    onclick={(e) => {
      e.stopPropagation();
      open = !open;
    }}
    class="flex h-6 w-6 items-center justify-center rounded-full text-white transition hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/50"
  >
    <!-- 아이콘 자체가 버튼: info 아이콘의 원(흰 테두리)이 곧 버튼 형태라 바깥 원형 배경은 두지 않는다.
         드롭섀도로 밝은 썸네일 위에서도 대비를 확보(흰 아이콘이 묻히지 않게) -->
    <svg
      class="h-5 w-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  </button>

  {#if open}
    <div
      role="dialog"
      aria-label={title}
      class="absolute left-0 top-7 w-52 rounded-lg border border-line bg-surface p-2.5 text-left shadow-lg"
    >
      <p class="mb-1.5 text-[11px] font-semibold text-fg">{title}</p>
      {#if items.length === 0}
        <p class="text-[11px] text-fg-subtle">표시할 정보가 없습니다.</p>
      {:else}
        <dl class="flex flex-col gap-1.5">
          {#each items as item (item.label)}
            <div class="flex flex-col">
              <dt class="text-[10px] text-fg-subtle">{item.label}</dt>
              <dd class="break-words text-[11px] text-fg">{item.value}</dd>
            </div>
          {/each}
        </dl>
      {/if}
    </div>
  {/if}
</div>
