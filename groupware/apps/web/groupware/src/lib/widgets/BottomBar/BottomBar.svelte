<script lang="ts">
  import { page } from '$app/stores';
  import { footerNotices } from '$lib/shared/lib/constants/footerNotices';
  import { openPopout } from '@csc/shared-ui/popout';
  import { popouts } from '$lib/shared/lib/popout/popouts';
  import { reserveBottomInset } from '$lib/shared/lib/actions/reserveBottomInset';

  // 셸 하단의 얇은 공지 바. 데이터 주도(footerNotices)이고 side로 좌/우 그룹을 나눈다.
  // 하단 고정 오버레이(토스트 등)가 이 바를 덮지 않도록 자기 높이를 예약한다(reserveBottomInset 액션)
  const startNotices = $derived(footerNotices.filter((n) => n.side === 'start'));
  const endNotices = $derived(footerNotices.filter((n) => n.side === 'end'));

  // [orgSlug] 라우트 하위라 항상 존재하지만, params 인덱스 접근은 string|undefined 라 폴백한다.
  const orgSlug = $derived($page.params.orgSlug ?? '');

  // 더보기(+) → 공지 상세 팝아웃(window.open). 공지마다 같은 name 으로 단일 창
  function openNotice(item: (typeof footerNotices)[number]): void {
    openPopout(popouts.notice(orgSlug, item.id));
  }
</script>

{#snippet notice(item: (typeof footerNotices)[number])}
  <div class="flex min-w-0 items-center gap-2">
    {#if item.badge}
      <span class="shrink-0 rounded bg-orange-500 px-1.5 py-0.5 text-xs font-bold text-white">
        {item.badge}
      </span>
    {:else}
      <!-- 스피커(공지) 아이콘 -->
      <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-gray-400" fill="currentColor" aria-hidden="true">
        <path d="M3 10v4h4l5 5V5L7 10H3Zm13.5 2a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12Z" />
      </svg>
    {/if}
    <span class="truncate text-gray-700">{item.text}</span>
    <button
      type="button"
      aria-label="{item.text} 자세히 보기"
      onclick={() => openNotice(item)}
      class="shrink-0 leading-none text-gray-400 transition-colors hover:text-gray-600"
    >
      +
    </button>
  </div>
{/snippet}

<div
  use:reserveBottomInset
  class="flex h-9 w-full shrink-0 items-center justify-between gap-4 border-t border-gray-200 bg-white px-4 text-sm"
>
  <div class="flex min-w-0 items-center gap-4">
    {#each startNotices as item (item.id)}
      {@render notice(item)}
    {/each}
  </div>
  <div class="flex min-w-0 items-center gap-4">
    {#each endNotices as item (item.id)}
      {@render notice(item)}
    {/each}
  </div>
</div>
