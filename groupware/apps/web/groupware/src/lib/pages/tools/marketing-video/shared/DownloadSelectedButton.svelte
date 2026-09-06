<script lang="ts">
  // 선택분 다운로드 버튼: SelectionActionBar 의 above 슬롯에 얹는 보조 액션
  //   워크스페이스 최종 탭과 보관함이 공유한다(둘 다 완성 영상을 골라 내려받는 화면)
  //   대상 산출(완성본만 거르기)은 호출부가 하고, 여기선 실행/진행/실패 표시만 한다.
  import type { BulkDownloadItem } from '$lib/shared/lib/utils/bulkDownload.svelte';
  import Spinner from '$lib/shared/ui/Spinner.svelte';

  interface Props {
    // 받을 항목: 비어 있으면 버튼이 비활성화된다.
    items: readonly BulkDownloadItem[];
    // createBulkDownload() 인스턴스의 진행 상태
    state: { done: number; total: number; busy: boolean; error: string | null };
    onDownload: () => void;
  }
  let { items, state, onDownload }: Props = $props();
</script>

<div class="flex flex-col items-center gap-1">
  {#if state.error}
    <span
      class="rounded-full bg-danger-bg px-2.5 py-1 text-[11px] text-danger-fg shadow"
      role="status"
      aria-live="polite"
    >
      {state.error}
    </span>
  {/if}
  <button
    type="button"
    onclick={onDownload}
    disabled={state.busy || items.length === 0}
    class="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-fg shadow transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 disabled:opacity-50"
  >
    {#if state.busy}
      <Spinner class="h-3.5 w-3.5" />
      다운로드 중 {state.done}/{state.total}
    {:else}
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
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      다운로드{items.length > 1 ? ` ${items.length}개` : ''}
    {/if}
  </button>
</div>
