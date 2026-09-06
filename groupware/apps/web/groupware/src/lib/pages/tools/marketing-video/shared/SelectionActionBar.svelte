<script lang="ts">
  // 다중 선택 확정 바: 삭제/영상만들기 등 선택 기반 일괄 작업의 공용 하단 바
  //   선택 1개 이상일 때 화면 하단 중앙에 뜬다(세로/가로 공통, fixed 중앙 정렬)
  //   variant 로 색/아이콘만 달라지고 구조는 동일: 새 일괄 작업이 생겨도 이 바를 재사용한다.
  //   셸이 하단에 깔아 둔 크롬(하단 탭 등)은 bottomInsetStore 의 합만 읽어 그만큼 위로 띄운다.
  //   여기서 무엇이 깔려 있는지를 알면 셸이 늘 때마다 이 파일이 따라 바뀐다(ToastHost 와 같은 규칙).
  import type { Snippet } from 'svelte';
  import { bottomInsetStore } from '$lib/shared/lib/stores/viewport/bottomInsetStore/bottomInsetStore.svelte';

  type Variant = 'danger' | 'primary';

  interface Props {
    count: number;
    // 확정 버튼 라벨(예: '삭제하기', '영상 만들기')
    confirmLabel: string;
    // 색/아이콘 계열: danger(삭제) | primary(영상 만들기 등)
    variant?: Variant;
    pending?: boolean;
    // 바 위에 얹는 보조 컨트롤(예: 영상 만들기의 화질 선택). 작업별로 다르므로 호출부가 넘긴다.
    above?: Snippet;
    onConfirm: () => void;
    onCancel: () => void;
  }
  let {
    count,
    confirmLabel,
    variant = 'danger',
    pending = false,
    above,
    onConfirm,
    onCancel,
  }: Props = $props();

  /** 하단 크롬이 점유한 높이(px). 기본 여백에 더한다. 등록이 없으면 0(기존과 동일) */
  const bottomInset = $derived(bottomInsetStore.px);

  const CONFIRM_CLASS: Record<Variant, string> = {
    danger: 'bg-danger-fg text-white focus-visible:ring-danger-fg/40',
    primary: 'bg-fg text-surface focus-visible:ring-fg/40',
  };
  // 아이콘 path: danger=휴지통, primary=업로드(영상 만들기)
  const ICON_PATHS: Record<Variant, string[]> = {
    danger: ['M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6'],
    primary: ['M12 15V3', 'm7 8 5-5 5 5', 'M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4'],
  };
</script>

{#if count > 0}
  <!-- fixed + left-1/2 + -translate-x-1/2 = 뷰포트 가로 중앙(세로/가로 방향 무관). 하단 여백으로 콘텐츠와 분리
       선택 개수는 액션 바 아래에 별도 배지로 둔다(개수와 실행 버튼을 시각적으로 분리) -->
  <div
    class="fixed left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
    style="bottom: calc(1.5rem + {bottomInset}px)"
  >
    {#if above}{@render above()}{/if}
    <div class="flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-lg">
      <button
        type="button"
        onclick={onCancel}
        class="rounded-full px-3 py-1.5 text-sm text-fg-subtle transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
      >
        취소
      </button>
      <button
        type="button"
        onclick={onConfirm}
        disabled={pending}
        class="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition hover:opacity-90 focus:outline-none focus-visible:ring-2 disabled:opacity-50 {CONFIRM_CLASS[
          variant
        ]}"
      >
        <svg
          class="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          {#each ICON_PATHS[variant] as d}
            <path {d} />
          {/each}
        </svg>
        {confirmLabel}
      </button>
    </div>
    <span
      class="rounded-full bg-fg px-3 py-1 text-xs font-medium text-surface shadow"
      role="status"
      aria-live="polite"
    >
      {count}개 선택됨
    </span>
  </div>
{/if}
