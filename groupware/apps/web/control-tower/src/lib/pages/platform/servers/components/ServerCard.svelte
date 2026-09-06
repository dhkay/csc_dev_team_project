<script lang="ts">
  import UsageGauge from './UsageGauge.svelte';
  import UsageLineChart from './UsageLineChart.svelte';
  import ResourceDetailModal from './ResourceDetailModal.svelte';
  import type {
    MetricSample,
    ResourceKey,
    ServerWithStatus,
  } from '$lib/features/server-monitoring/types';
  import { RESOURCE_META, METRIC_TERM } from '$lib/features/server-monitoring/resourceMeta';

  interface Props {
    server: ServerWithStatus;
    samples: MetricSample[];
  }
  let { server, samples }: Props = $props();

  // 게이지 클릭 시 열리는 리소스 상세 모달
  let openResource = $state<ResourceKey | null>(null);
  // 열린 리소스의 성격(가동률/사용률): 라벨, 설명, 색 분기
  const openKind = $derived(openResource ? RESOURCE_META[openResource].kind : 'utilization');
  const rateLabel = $derived(METRIC_TERM[openKind].rate);
  // 모달에 표시할 장치 식별 라인(리소스별)
  //  - cpu : 정확한 CPU 제품명(리눅스 /proc/cpuinfo, Windows 레지스트리)
  //  - ram : 물리 메모리 총량(RAM 은 제품명이 없음. SMBIOS 필요, 여기선 용량으로 식별)
  //  - gpu/vram : GPU 장치명
  const modalDeviceName = $derived.by(() => {
    if (!m || !openResource) return undefined;
    if (openResource === 'gpu' || openResource === 'vram') return deviceName;
    if (openResource === 'cpu') return m.cpu.model ?? undefined;
    if (openResource === 'ram') return `물리 메모리, ${gb(m.memory.totalBytes)} GB`;
    return undefined;
  });

  // 모달 헤더 요약: 현재 리소스 값
  const modalSummary = $derived.by(() => {
    if (!m || !openResource) return [] as { label: string; value: string }[];
    switch (openResource) {
      case 'cpu':
        return [
          { label: rateLabel, value: `${m.cpu.percent.toFixed(0)}%` },
          { label: '코어', value: `${m.cpu.cores}` },
        ];
      case 'ram':
        return [
          { label: rateLabel, value: `${m.memory.percent.toFixed(0)}%` },
          { label: '사용', value: `${gb(m.memory.usedBytes)} / ${gb(m.memory.totalBytes)} GB` },
        ];
      case 'gpu':
        return [
          { label: rateLabel, value: `${gpuUtil.toFixed(0)}%` },
          { label: 'GPU 수', value: `${m.gpus.length}` },
        ];
      case 'vram':
        return [
          { label: rateLabel, value: `${vramPct.toFixed(0)}%` },
          {
            label: 'VRAM',
            value: `${gb(avg(m.gpus.map((g) => g.memUsedBytes)))} / ${gb(avg(m.gpus.map((g) => g.memTotalBytes)))} GB`,
          },
        ];
      case 'disk':
        return m.disk
          ? [
              { label: rateLabel, value: `${m.disk.percent.toFixed(0)}%` },
              { label: '사용', value: `${gb(m.disk.usedBytes)} / ${gb(m.disk.totalBytes)} GB` },
            ]
          : [];
    }
  });

  const m = $derived(server.metrics);
  const hasGpu = $derived((m?.gpus.length ?? 0) > 0);
  // GPU/VRAM 모달에 표시할 장치명(예: "NVIDIA GeForce RTX 5060 Ti")
  const deviceName = $derived(
    hasGpu ? [...new Set(m!.gpus.map((g) => g.name))].join(', ') : undefined,
  );
  const gpuUtil = $derived(hasGpu ? avg(m!.gpus.map((g) => g.utilPercent)) : 0);
  const vramPct = $derived(hasGpu ? avg(m!.gpus.map((g) => g.memPercent)) : 0);

  const roleLabel: Record<string, string> = { web: 'Web', ai: 'AI', all: 'All' };

  // 표시할 게이지(존재하는 리소스만): 라이브 값, 보조텍스트만 담고
  // 라벨, 색, 성격(가동률/사용률)은 RESOURCE_META 가 결정. 게이지와 차트가 이 하나에서 파생
  const gauges = $derived.by(() => {
    if (!m) return [] as { key: ResourceKey; percent: number; sub: string }[];
    const list = [
      { key: 'cpu' as ResourceKey, percent: m.cpu.percent, sub: `${m.cpu.cores} cores` },
      {
        key: 'ram' as ResourceKey,
        percent: m.memory.percent,
        sub: `${gb(m.memory.usedBytes)} / ${gb(m.memory.totalBytes)} GB`,
      },
    ];
    if (m.disk) {
      list.push({
        key: 'disk',
        percent: m.disk.percent,
        sub: `${gb(m.disk.usedBytes)} / ${gb(m.disk.totalBytes)} GB`,
      });
    }
    if (hasGpu) {
      list.push({ key: 'gpu', percent: gpuUtil, sub: `${m.gpus.length} GPU` });
      list.push({
        key: 'vram',
        percent: vramPct,
        sub: `${gb(avg(m.gpus.map((g) => g.memUsedBytes)))} / ${gb(avg(m.gpus.map((g) => g.memTotalBytes)))} GB`,
      });
    }
    return list;
  });

  // 라인차트 시리즈 = 게이지와 동일한 리소스 집합/색
  const chartSeries = $derived(
    gauges.map((g) => ({
      key: g.key,
      label: RESOURCE_META[g.key].label,
      color: RESOURCE_META[g.key].color,
    })),
  );

  function avg(xs: number[]): number {
    return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0;
  }
  function gb(bytes: number): string {
    return (bytes / 1024 ** 3).toFixed(1);
  }
</script>

<article class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
  <!-- 헤더 -->
  <header class="flex items-start justify-between gap-2">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <h3 class="truncate text-sm font-bold text-gray-900">{server.label}</h3>
        <span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
          {roleLabel[server.role] ?? server.role}
        </span>
      </div>
      {#if m?.cpu.model}
        <p class="mt-0.5 truncate text-[11px] text-gray-400" title={m.cpu.model}>{m.cpu.model}</p>
      {/if}
    </div>
    <span class="flex shrink-0 items-center gap-1.5 text-[11px] font-medium">
      <span
        class="h-2 w-2 rounded-full {server.status === 'online'
          ? 'bg-emerald-500'
          : 'bg-gray-300'}"
      ></span>
      <span class={server.status === 'online' ? 'text-emerald-600' : 'text-gray-400'}>
        {server.status === 'online' ? '온라인' : '오프라인'}
      </span>
    </span>
  </header>

  {#if server.status === 'offline' || !m}
    <div class="flex h-40 items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-400">
      지표를 가져올 수 없습니다 (오프라인)
    </div>
  {:else}
    <!-- 게이지 (존재하는 리소스만). 라벨, 색, 성격은 RESOURCE_META. 클릭 → 리소스 상세 모달 -->
    <div class="grid grid-cols-3 gap-2">
      {#each gauges as g (g.key)}
        <UsageGauge
          label={RESOURCE_META[g.key].label}
          kind={RESOURCE_META[g.key].kind}
          color={RESOURCE_META[g.key].color}
          percent={g.percent}
          sub={g.sub}
          onclick={() => (openResource = g.key)}
        />
      {/each}
    </div>

    <!-- 시계열 -->
    <UsageLineChart data={samples} series={chartSeries} />

    <!-- GPU 상세(있을 때) -->
    {#if hasGpu}
      <ul class="space-y-1 border-t border-gray-100 pt-2 text-[11px] text-gray-500">
        {#each m.gpus as g (g.index)}
          <li class="flex items-center justify-between gap-2">
            <span class="truncate" title={g.name}>#{g.index} {g.name}</span>
            <span class="shrink-0 tabular-nums text-gray-400">
              {g.utilPercent.toFixed(0)}%, {gb(g.memUsedBytes)}/{gb(g.memTotalBytes)}GB{#if g.tempC != null},
                {g.tempC.toFixed(0)}°C{/if}{#if g.powerW != null}, {g.powerW.toFixed(0)}W{/if}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</article>

{#if openResource && m}
  <ResourceDetailModal
    serverId={server.id}
    serverLabel={server.label}
    resource={openResource}
    resourceLabel={RESOURCE_META[openResource].label}
    kind={openKind}
    color={RESOURCE_META[openResource].color}
    summary={modalSummary}
    deviceName={modalDeviceName}
    onclose={() => (openResource = null)}
  />
{/if}
