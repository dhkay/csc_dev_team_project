<script lang="ts">
  // 하단 탭 바: 지금 돌고 있는 일을 화면 아래에 남겨 되돌아갈 수 있게 하는 줄
  //
  // 셸의 in-flow 행이다(fixed 가 아니다). 그래서 사이드바나 본문을 덮지 않고, 놓인 열의 폭만
  //   차지한다. 어디에 둘지는 호출부가 정한다: 콘텐츠 열 안에 두면 사이드바 오른쪽만 차지하고,
  //   셸 열 맨 아래에 두면 화면 전체 폭이 된다.
  // 항목이 없으면 아무것도 렌더하지 않는다. 빈 줄이 남으면 그만큼 본문이 늘 좁아진다.
  // 자기 높이는 bottomInsetStore 에 예약한다. 하단 고정 오버레이(토스트, 선택 확정 바)가 그 합을
  //   읽어 위로 비켜서므로, 양쪽 다 상대를 모른 채 겹침이 사라진다.
  // 순수 표현 컴포넌트: 무엇이 담기고 무엇이 활성인지는 호출부가 정해 prop 으로 내려준다.
  import Spinner from '$lib/shared/ui/Spinner.svelte';
  import { reserveBottomInset } from '$lib/shared/lib/actions/reserveBottomInset';
  import type { BottomTabItem } from './bottomTab.types';

  interface Props {
    items: BottomTabItem[];
    // 지금 열려 있는 탭. 없으면 아무것도 강조하지 않는다.
    activeId?: string | null;
    onSelect: (id: string) => void;
    // 닫기(×). `closable` 인 항목에만 그린다. 주지 않으면 어느 항목에도 그리지 않는다.
    onClose?: (id: string) => void;
    // 이 줄이 무엇의 목록인지(스크린리더). 화면에는 보이지 않는다.
    label: string;
  }
  let { items, activeId = null, onSelect, onClose, label }: Props = $props();

  // 세로 휠 → 가로 스크롤. 실제로 넘칠 때만 가로채 다른 스크롤 동작을 건드리지 않는다.
  //   (MarketingVideoNav 의 보조앱바와 같은 규칙)
  function handleWheel(e: WheelEvent): void {
    const el = e.currentTarget as HTMLElement;
    if (e.deltaY === 0 || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  }
</script>

{#if items.length > 0}
  <nav
    use:reserveBottomInset
    aria-label={label}
    class="flex w-full shrink-0 items-center border-t border-line bg-surface px-2 py-1.5"
  >
    <div
      class="glass-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto"
      onwheel={handleWheel}
    >
      {#each items as item (item.id)}
        <!-- 칩 하나에 동작 둘(열기, 닫기)이라 버튼을 겹치지 않고 나란히 둔다. 버튼 안에 버튼을
             넣으면 유효하지 않은 마크업이고 키보드 순서도 무너진다. -->
        <div
          class="relative flex shrink-0 items-center overflow-hidden rounded-md border transition {activeId ===
          item.id
            ? 'border-fg/25 bg-hover text-fg'
            : 'border-line text-fg-subtle hover:bg-hover hover:text-fg'}"
        >
          <button
            type="button"
            onclick={() => onSelect(item.id)}
            title={item.title ?? item.label}
            aria-current={activeId === item.id ? 'true' : undefined}
            class="flex items-center gap-2 py-1.5 pl-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40 {onClose &&
            item.closable
              ? 'pr-1.5'
              : 'pr-3'} {activeId === item.id ? 'font-medium' : ''}"
          >
            {#if item.busy}
              <Spinner class="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
            {/if}
            <span class="max-w-40 truncate">{item.label}</span>
            {#if item.badge}
              <span
                class="shrink-0 rounded bg-fg/10 px-1.5 py-0.5 text-xs tabular-nums text-fg-muted"
              >
                {item.badge}
              </span>
            {/if}
          </button>
          {#if onClose && item.closable}
            <button
              type="button"
              onclick={() => onClose(item.id)}
              aria-label="{item.label} 닫기"
              title="닫기"
              class="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-fg-subtle transition hover:bg-fg/10 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <svg
                class="size-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          {/if}
          {#if item.percent !== undefined}
            <!-- 진행선: 칩 아래 모서리. 숫자를 읽지 않아도 어디쯤인지 보인다.
                 aria-hidden 인 이유는 같은 값이 배지에 글자로 이미 있기 때문이다. -->
            <span
              class="absolute inset-x-0 bottom-0 h-0.5 bg-brand transition-[width] duration-300"
              style="width: {Math.max(0, Math.min(100, item.percent))}%"
              aria-hidden="true"
            ></span>
          {/if}
        </div>
      {/each}
    </div>
  </nav>
{/if}
