<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { openPopout } from '@csc/shared-ui/popout';
  import { popouts } from '$lib/shared/lib/popout/popouts';
  import { subscribePopout } from '$lib/shared/lib/popout/popoutChannel';
  import type { OrganizationSummary } from '$lib/features/organizations/types';
  import OrganizationList from './components/OrganizationList.svelte';
  import OrganizationStatusBadge from './components/OrganizationStatusBadge.svelte';
  import { viewportModeStore } from '$lib/shared/lib/stores/viewport/viewportModeStore/viewportModeStore.svelte';

  // 목록은 +page.server.ts load 의 실데이터. 추가/상세는 팝아웃(window.open)으로 연다.
  let {
    organizations,
    loadError = false,
  }: { organizations: OrganizationSummary[]; loadError?: boolean } = $props();

  // landscape(가로, 데스크톱)에서는 컨테이너를 가운데 정렬 + 폭 제한(반응형: 큰 화면일수록 한 단계 더 넓게). portrait 은 전체폭
  const narrow = $derived(!viewportModeStore.isPortrait);
  const containerClass = $derived(narrow ? 'mx-auto max-w-xl 2xl:max-w-2xl' : '');

  // 추가/상세는 팝아웃(다른 문서)에서 처리되므로, 여기(여는 창)서 변경 알림을 받아 목록을 새로고침한다.
  onMount(() =>
    subscribePopout((msg) => {
      if (msg.type === 'org:changed') invalidateAll();
    }),
  );

  function openCreate(): void {
    openPopout(popouts.orgCreate());
  }

  function openDetail(org: OrganizationSummary): void {
    openPopout(popouts.orgDetail(org.id));
  }
</script>

<div class="space-y-5 {containerClass}">
  <header class="space-y-1">
    <h1 class="text-xl font-bold text-gray-900 sm:text-2xl">조직 관리</h1>
    <p class="text-sm text-gray-500">플랫폼에 등록된 조직(테넌트)을 관리합니다.</p>
  </header>

  <section class="overflow-hidden rounded-lg border border-gray-200 bg-white">
    <!-- 패널 헤더(툴바): 좌측 제목 + 우상단 조직 추가 -->
    <div class="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
      <h2 class="text-sm font-semibold text-gray-700">
        조직 목록 <span class="font-normal text-gray-400">({organizations.length})</span>
      </h2>
      <button
        type="button"
        onclick={openCreate}
        class="inline-flex w-auto shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand/90"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        조직 추가
      </button>
    </div>

    {#if loadError}
      <div class="p-10 text-center text-sm text-red-600">조직 목록을 불러오지 못했습니다.</div>
    {:else if organizations.length === 0}
      <div class="flex flex-col items-center gap-5 px-6 py-12 text-center">
        <div>
          <p class="text-base font-semibold text-gray-900">아직 등록된 조직이 없습니다</p>
          <p class="mt-1 text-sm text-gray-500">‘조직 추가’로 첫 테넌트 조직을 만들어 보세요. 아래는 예시(데모)입니다.</p>
        </div>

        <!-- 데모 placeholder: 실제 조직이 어떻게 보이는지 보여주는 예시(클릭 불가) -->
        <div class="pointer-events-none w-full max-w-md select-none rounded-lg border border-dashed border-gray-300 bg-gray-50/60 p-4 text-left opacity-90">
          <div class="mb-2 flex items-center justify-between">
            <span class="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">데모</span>
            <OrganizationStatusBadge status="ACTIVE" />
          </div>
          <p class="font-medium text-gray-700">비즈오피스 데모</p>
          <p class="text-sm text-gray-400">/default, 테넌트</p>
        </div>

        <button
          type="button"
          onclick={openCreate}
          class="inline-flex items-center gap-1 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          조직 추가
        </button>
      </div>
    {:else}
      <OrganizationList items={organizations} onselect={openDetail} />
    {/if}
  </section>
</div>
