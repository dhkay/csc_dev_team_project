<script lang="ts">
  // 시계열 사용률 라인차트: LayerChart(Svelte 5). 폴링으로 누적한 버퍼를 %(0~100) 축으로 그린다.
  import { LineChart } from 'layerchart';
  import type { MetricSample } from '$lib/features/server-monitoring/types';

  interface SeriesDef {
    key: 'cpu' | 'ram' | 'disk' | 'gpu' | 'vram';
    label: string;
    color: string;
  }
  interface Props {
    data: MetricSample[];
    series: SeriesDef[];
  }
  let { data, series }: Props = $props();

  const chartSeries = $derived(
    series.map((s) => ({
      key: s.key,
      label: s.label,
      color: s.color,
      value: (d: MetricSample) => (d[s.key] ?? 0) as number,
    })),
  );
</script>

<div class="h-32 w-full text-gray-400">
  {#if data.length < 2}
    <div class="flex h-full items-center justify-center text-xs text-gray-400">
      데이터 수집 중…
    </div>
  {:else}
    <LineChart
      {data}
      x={(d: MetricSample) => d.t}
      yDomain={[0, 100]}
      padding={{ left: 28, bottom: 18, top: 6, right: 8 }}
      series={chartSeries}
    />
  {/if}
</div>
