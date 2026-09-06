<script lang="ts">
  // 게이지 클릭 시 뜨는 리소스 상세 모달: 현재값 + 하드웨어 상세(SMBIOS/NVML) + 점유 상위 프로세스
  // 데이터: TanStack Query(createQuery) → 하드웨어(정적, staleTime=∞) + top(on-demand)
  import { createQuery } from '@tanstack/svelte-query';
  import { serverTopQueryOptions } from '$lib/features/server-monitoring/queries/serverTop.query';
  import { serverHardwareQueryOptions } from '$lib/features/server-monitoring/queries/serverHardware.query';
  import type { ResourceKey } from '$lib/features/server-monitoring/types';
  import { METRIC_TERM, type MetricKind } from '$lib/features/server-monitoring/resourceMeta';

  interface SummaryItem {
    label: string;
    value: string;
  }
  interface Props {
    serverId: string;
    serverLabel: string;
    resource: ResourceKey;
    resourceLabel: string;
    // 지표 성격: 값 해석 설명(가동률/사용률) 분기
    kind: MetricKind;
    color: string;
    summary: SummaryItem[];
    deviceName?: string;
    onclose: () => void;
  }
  let { serverId, serverLabel, resource, resourceLabel, kind, color, summary, deviceName, onclose }:
    Props = $props();

  const kindHint = $derived(METRIC_TERM[kind].hint);

  // disk 은 프로세스 목록이 없으므로 top 쿼리 비활성(하드웨어 섹션만)
  //   $derived 여야 한다. 맨 const 로 두면 마운트 시점 resource 로 굳어, 모달이 재사용되며
  //   prop 만 바뀔 때(cpu → disk) 없는 프로세스 목록을 계속 조회한다. 아래 showBytes 와 같은 성질이다.
  const showProcesses = $derived(resource !== 'disk');
  const topQuery = createQuery(() =>
    serverTopQueryOptions(serverId, resource, showProcesses),
  );
  const hwQuery = createQuery(() => serverHardwareQueryOptions(serverId));

  const showBytes = $derived(resource !== 'cpu');

  function diskKindClass(kind: string): string {
    const k = kind.toLowerCase();
    if (k === 'ssd' || k === 'nvme') return 'bg-emerald-50 text-emerald-600';
    if (k === 'hdd') return 'bg-amber-50 text-amber-600';
    return 'bg-gray-100 text-gray-500';
  }
  const items = $derived(topQuery.data ?? []);
  const bytesUnavailable = $derived(
    showBytes && items.length > 0 && items.every((p) => !p.bytes),
  );

  function fmtBytes(b: number | null | undefined): string {
    if (b == null || b === 0) return '-';
    return b >= 1024 ** 3
      ? `${(b / 1024 ** 3).toFixed(2)} GB`
      : `${(b / 1024 ** 2).toFixed(0)} MB`;
  }
  function ghz(mhz: number | null): string {
    return mhz ? `${(mhz / 1000).toFixed(2)} GHz` : '-';
  }

  // 리소스별 하드웨어 스펙 라인(라벨/값): hwQuery.data 로부터
  const hwSpecs = $derived.by((): SummaryItem[] => {
    const hw = hwQuery.data;
    if (!hw) return [];
    if (resource === 'cpu') {
      const c = hw.cpu;
      return [
        { label: '제품명', value: c.model ?? '-' },
        { label: '코어/스레드', value: `${c.physicalCores ?? '?'} / ${c.logicalCores ?? '?'}` },
        { label: '클럭', value: c.maxMhz ? ghz(c.maxMhz) : ghz(c.baseMhz) },
        { label: '아키텍처', value: c.arch ?? '-' },
      ];
    }
    if (resource === 'ram') {
      return [{ label: '총 용량', value: fmtBytes(hw.memory.totalBytes) }];
    }
    return []; // gpu/vram 은 아래 별도 블록으로 렌더
  });
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') onclose();
  }}
/>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
  role="presentation"
  onclick={onclose}
>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <!-- tabindex="-1": role="dialog" 는 포커스를 받을 수 있어야 한다(스크린리더가 모달 진입을 알린다)
       -1 이라 탭 순서에는 들어가지 않고 스크립트/클릭으로만 포커스된다. -->
  <div
    class="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="{serverLabel} {resourceLabel} 상세"
    onclick={(e) => e.stopPropagation()}
  >
    <header
      class="sticky top-0 flex items-start justify-between gap-3 border-b border-gray-100 bg-white px-5 py-3"
    >
      <div>
        <div class="flex items-center gap-2">
          <span class="h-2.5 w-2.5 rounded-full" style="background:{color}"></span>
          <h3 class="text-sm font-bold text-gray-900">{resourceLabel}</h3>
        </div>
        {#if deviceName}
          <p class="mt-0.5 text-xs font-medium text-gray-600">{deviceName}</p>
        {/if}
        <p class="mt-0.5 text-xs text-gray-400">{serverLabel}</p>
      </div>
      <button
        type="button"
        onclick={onclose}
        class="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        aria-label="닫기"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
        </svg>
      </button>
    </header>

    <!-- 현재 값(라이브) -->
    <section class="px-5 py-3">
      <div class="grid grid-cols-2 gap-2">
        {#each summary as s (s.label)}
          <div class="rounded-lg bg-gray-50 px-3 py-2">
            <p class="text-[11px] text-gray-400">{s.label}</p>
            <p class="text-sm font-semibold text-gray-900">{s.value}</p>
          </div>
        {/each}
      </div>
      <!-- 값 해석(가동률 vs 사용률): GPU 90% 가 "포화"로 오해되지 않게 -->
      <p class="mt-2 text-[11px] leading-relaxed text-gray-400">{kindHint}</p>
    </section>

    <!-- 하드웨어 상세 -->
    <section class="border-t border-gray-100 px-5 py-3">
      <h4 class="mb-2 text-xs font-semibold text-gray-500">하드웨어</h4>
      {#if hwQuery.isPending}
        <p class="py-2 text-center text-xs text-gray-400">불러오는 중…</p>
      {:else if hwQuery.isError}
        <p class="py-2 text-center text-xs text-red-500">하드웨어 정보를 불러오지 못했습니다.</p>
      {:else if resource === 'ram' && hwQuery.data}
        <!-- RAM: 총 용량 + 모듈(SMBIOS) -->
        <dl class="mb-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt class="text-gray-400">총 용량</dt>
          <dd class="text-right font-medium text-gray-800">{fmtBytes(hwQuery.data.memory.totalBytes)}</dd>
        </dl>
        {#if hwQuery.data.memory.modules.length > 0}
          <ul class="space-y-1.5">
            {#each hwQuery.data.memory.modules as mod (mod.slot)}
              <li class="rounded-lg bg-gray-50 px-3 py-2 text-xs">
                <div class="flex items-center justify-between">
                  <span class="font-medium text-gray-700">{mod.slot ?? '모듈'}</span>
                  <span class="tabular-nums text-gray-500">
                    {fmtBytes(mod.sizeBytes)}, {mod.kind ?? ''}{#if mod.speedMhz},
                      {mod.speedMhz}MHz{/if}
                  </span>
                </div>
                {#if mod.manufacturer || mod.partNumber}
                  <p class="mt-0.5 text-[11px] text-gray-400">
                    {mod.manufacturer ?? ''}{#if mod.partNumber}, {mod.partNumber}{/if}
                  </p>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-[11px] text-gray-400">모듈 정보 없음(SMBIOS 미제공).</p>
        {/if}
      {:else if resource === 'disk' && hwQuery.data}
        <!-- 물리 디스크(SSD/HDD/NVMe) -->
        {#if hwQuery.data.physicalDisks.length > 0}
          <p class="mb-1 text-[11px] font-medium text-gray-400">물리 디스크</p>
          <ul class="mb-3 space-y-1.5">
            {#each hwQuery.data.physicalDisks as d (d.name)}
              <li class="rounded-lg bg-gray-50 px-3 py-2 text-xs">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate font-medium text-gray-700" title={d.model ?? d.name}>
                    {d.model ?? d.name}
                  </span>
                  <span
                    class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold {diskKindClass(
                      d.kind,
                    )}"
                  >
                    {d.kind}
                  </span>
                </div>
                <p class="mt-0.5 text-[11px] text-gray-400">
                  {fmtBytes(d.sizeBytes)}{#if d.bus}, {d.bus.toUpperCase()}{/if}
                </p>
              </li>
            {/each}
          </ul>
        {/if}
        <!-- 볼륨(마운트) 사용량 -->
        {#if hwQuery.data.disks.length > 0}
          <p class="mb-1 text-[11px] font-medium text-gray-400">볼륨</p>
          <ul class="space-y-1.5">
            {#each hwQuery.data.disks as v (v.mountpoint)}
              <li class="text-xs">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-gray-700" title="{v.device}, {v.fstype}">
                    {v.mountpoint}{#if v.fstype}, {v.fstype}{/if}
                  </span>
                  <span class="shrink-0 tabular-nums text-gray-500">
                    {fmtBytes(v.usedBytes)} / {fmtBytes(v.totalBytes)}, {v.percent.toFixed(0)}%
                  </span>
                </div>
                <div class="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    class="h-full rounded-full"
                    style="width:{Math.min(100, Math.max(2, v.percent))}%;background:{color}"
                  ></div>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      {:else if (resource === 'gpu' || resource === 'vram') && hwQuery.data}
        <!-- GPU/VRAM: 장치별 상세 -->
        {#if hwQuery.data.gpus.length > 0}
          <ul class="space-y-1.5">
            {#each hwQuery.data.gpus as g (g.index)}
              <li class="rounded-lg bg-gray-50 px-3 py-2 text-xs">
                <p class="font-medium text-gray-700">#{g.index} {g.name}</p>
                <p class="mt-0.5 text-[11px] text-gray-500">
                  VRAM {fmtBytes(g.memTotalBytes)}{#if g.driverVersion},
                    드라이버 {g.driverVersion}{/if}{#if g.powerLimitW},
                    TDP {g.powerLimitW}W{/if}
                </p>
                {#if g.vbios}
                  <p class="text-[11px] text-gray-400">VBIOS {g.vbios}</p>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-[11px] text-gray-400">GPU 정보 없음.</p>
        {/if}
      {:else}
        <!-- CPU 등 라벨/값 스펙 -->
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {#each hwSpecs as spec (spec.label)}
            <dt class="text-gray-400">{spec.label}</dt>
            <dd class="truncate text-right font-medium text-gray-800" title={spec.value}>
              {spec.value}
            </dd>
          {/each}
        </dl>
      {/if}
    </section>

    <!-- 점유 상위 프로세스 (disk 제외: I/O 프로세스는 별도) -->
    {#if showProcesses}
    <section class="border-t border-gray-100 px-5 pb-4 pt-3">
      <h4 class="mb-2 text-xs font-semibold text-gray-500">점유 상위 프로세스</h4>
      {#if topQuery.isPending}
        <p class="py-4 text-center text-xs text-gray-400">불러오는 중…</p>
      {:else if topQuery.isError}
        <p class="py-4 text-center text-xs text-red-500">
          {(topQuery.error as Error)?.message ?? '불러오지 못했습니다.'}
        </p>
      {:else if items.length === 0}
        <p class="py-4 text-center text-xs text-gray-400">표시할 프로세스가 없습니다.</p>
      {:else}
        <ul class="space-y-1.5">
          {#each items as p (p.pid)}
            <li>
              <div class="flex items-center justify-between gap-2 text-xs">
                <span class="truncate font-medium text-gray-700" title="{p.name} (pid {p.pid})">
                  {p.name}
                </span>
                <span class="shrink-0 tabular-nums text-gray-500">
                  {p.percent.toFixed(1)}%{#if showBytes && p.bytes},
                    {fmtBytes(p.bytes)}{/if}
                </span>
              </div>
              <div class="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  class="h-full rounded-full"
                  style="width:{Math.min(100, Math.max(2, p.percent))}%;background:{color}"
                ></div>
              </div>
            </li>
          {/each}
        </ul>
        {#if bytesUnavailable}
          <p class="mt-2 text-[11px] text-gray-400">
            * 이 드라이버에선 프로세스별 VRAM 이 제공되지 않아 목록만 표시합니다.
          </p>
        {/if}
      {/if}
    </section>
    {/if}
  </div>
</div>
