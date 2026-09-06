<script lang="ts">
  // 서버 관리(모니터링): (app) 셸 + 플랫폼 관리자 가드 상속(ROOT 가드는 +page.server.ts)
  // 그리드 폴링 = TanStack Query(refetchInterval 3s). SSR 초기 스냅샷은 initialData 로 시드
  // 폴링 데이터가 갱신될 때마다 시계열 버퍼에 반영 → 카드 그래프의 시간축
  import { onMount, untrack } from 'svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { serversMetricsQueryOptions } from '$lib/features/server-monitoring/queries/serversMetrics.query';
  import { sampleBuffer } from '$lib/features/server-monitoring/stores/sampleBuffer.svelte';
  import type { ServerWithStatus } from '$lib/features/server-monitoring/types';
  import ServerCard from './components/ServerCard.svelte';

  interface Props {
    servers: ServerWithStatus[];
    loadError?: boolean;
  }
  let { servers, loadError = false }: Props = $props();

  const query = createQuery(() => serversMetricsQueryOptions(servers));

  // 폴링 스냅샷이 갱신될 때마다 링버퍼에 push(동일 timestamp 는 스토어가 무시)
  // push 는 buffer.history 를 read+write 하므로 untrack 으로 감싸 이 effect 의 의존성에서 제외한다.
  //  → 아니면 "history 읽고 씀"이 자기 자신을 재실행시켜 무한 루프(effect_update_depth_exceeded)
  //  effect 는 오직 query.data(폴링 결과) 변화에만 반응한다.
  $effect(() => {
    const data = query.data;
    if (data) untrack(() => sampleBuffer.push(data));
  });

  onMount(() => {
    sampleBuffer.reset();
    return () => sampleBuffer.reset();
  });

  const list = $derived(query.data ?? servers);
  const pollError = $derived(
    query.isError ? ((query.error as Error)?.message ?? '갱신 오류') : null,
  );
</script>

<div class="space-y-5">
  <header class="flex items-end justify-between gap-3">
    <div class="space-y-1">
      <h1 class="text-xl font-bold text-gray-900 sm:text-2xl">서버 관리</h1>
      <p class="text-sm text-gray-500">
        실행 중인 서버의 자원 사용량을 실시간으로 모니터링합니다.
      </p>
    </div>
    <span class="flex items-center gap-1.5 text-xs text-gray-400">
      <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></span>
      3초마다 갱신
    </span>
  </header>

  {#if pollError}
    <p class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
      실시간 갱신 오류: {pollError}. 이전 값을 표시 중입니다.
    </p>
  {/if}

  {#if loadError && list.length === 0}
    <p class="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-600">
      서버 지표를 불러오지 못했습니다. 잠시 후 다시 시도하세요.
    </p>
  {:else if list.length === 0}
    <p class="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
      등록된 서버가 없습니다.
    </p>
  {:else}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {#each list as server (server.id)}
        <ServerCard {server} samples={sampleBuffer.history[server.id] ?? []} />
      {/each}
    </div>
  {/if}
</div>
