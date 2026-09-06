<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { openPopout } from '@csc/shared-ui/popout';
  import { popouts } from '$lib/shared/lib/popout/popouts';
  import { subscribePopout } from '$lib/shared/lib/popout/popoutChannel';
  import type { AdminSummary } from '$lib/features/admins/types';
  import AdminList from './components/AdminList.svelte';
  import { viewportModeStore } from '$lib/shared/lib/stores/viewport/viewportModeStore/viewportModeStore.svelte';

  // 목록은 +page.server.ts load(ROOT 가드 통과)의 실데이터. 추가/상세는 팝아웃으로 연다.
  let {
    admins,
    loadError = false,
  }: {
    admins: AdminSummary[];
    loadError?: boolean;
  } = $props();

  // landscape(가로, 데스크톱)에서는 컨테이너를 가운데 정렬 + 폭 제한(반응형: 큰 화면일수록 한 단계 더 넓게). portrait 은 전체폭
  const narrow = $derived(!viewportModeStore.isPortrait);
  const containerClass = $derived(narrow ? 'mx-auto max-w-xl 2xl:max-w-2xl' : '');

  // 추가/상세 팝아웃(다른 문서)에서의 변경을 받아 목록을 새로고침한다.
  onMount(() =>
    subscribePopout((msg) => {
      if (msg.type === 'admin:changed') invalidateAll();
    }),
  );

  function openCreate(): void {
    openPopout(popouts.adminCreate());
  }

  function openDetail(admin: AdminSummary): void {
    openPopout(popouts.adminDetail(admin.id));
  }
</script>

<div class="space-y-5 {containerClass}">
  <header class="space-y-1">
    <h1 class="text-xl font-bold text-gray-900 sm:text-2xl">관리자 관리</h1>
    <p class="text-sm text-gray-500">
      플랫폼 관리자(운영자)와 각 관리자의 관리 영역 접근 옵션을 관리합니다. ROOT 만 접근할 수 있습니다.
    </p>
  </header>

  <section class="overflow-hidden rounded-lg border border-gray-200 bg-white">
    <div class="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
      <h2 class="text-sm font-semibold text-gray-700">
        관리자 목록 <span class="font-normal text-gray-400">({admins.length})</span>
      </h2>
      <button
        type="button"
        onclick={openCreate}
        class="inline-flex w-auto shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand/90"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        관리자 추가
      </button>
    </div>

    {#if loadError}
      <div class="p-10 text-center text-sm text-red-600">관리자 목록을 불러오지 못했습니다.</div>
    {:else if admins.length === 0}
      <div class="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <p class="text-base font-semibold text-gray-900">아직 등록된 관리자가 없습니다</p>
        <p class="-mt-2 text-sm text-gray-500">‘관리자 추가’로 플랫폼 일반관리자를 만들고 옵션을 부여하세요.</p>
      </div>
    {:else}
      <AdminList items={admins} onselect={openDetail} />
    {/if}
  </section>
</div>
