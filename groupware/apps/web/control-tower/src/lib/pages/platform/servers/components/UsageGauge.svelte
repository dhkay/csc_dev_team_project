<script lang="ts">
  // 반원 게이지(SVG, 의존성 없음): 0~100%.
  // 채움은 pathLength="100" 정규화로 그린다 → dasharray 단위가 곧 % 라 아크 반지름과 무관하게 정확
  // (이전엔 반지름 44 아크에 둘레를 R=40 으로 잘못 계산해 패턴이 반복 → 작은 값에서 양끝에 조각이 생김.)
  //
  // kind(USE 방법론)로 색, 용어를 분기한다(resourceMeta.ts):
  //  - utilization(가동률): 높음=정상 → 고정 브랜드색, 경고 없음
  //  - capacity(사용률)   : 높음=포화 → 근접 시 amber(≥85)→red(≥95) 경고
  import type { MetricKind } from '$lib/features/server-monitoring/resourceMeta';

  interface Props {
    label: string;
    percent: number;
    // 지표 성격: 색/용어 분기
    kind: MetricKind;
    // 게이지 아래 보조 텍스트(예: "12.3 / 32 GB", "2 cores")
    sub?: string;
    // 식별 브랜드색(가동률의 고정색 / 용량의 정상 범위 색)
    color?: string;
    // 지정 시 게이지가 클릭 가능(버튼): 리소스 상세 모달 등
    onclick?: () => void;
  }
  let { label, percent, kind, sub, color, onclick }: Props = $props();

  const clamped = $derived(Math.max(0, Math.min(100, percent)));
  const base = $derived(color ?? '#10b981');
  // 용량만 근접 경고색. 가동률은 높아도 브랜드색 유지(과부하 아님)
  const stroke = $derived(
    kind === 'capacity'
      ? clamped >= 95
        ? '#dc2626'
        : clamped >= 85
          ? '#f59e0b'
          : base
      : base,
  );
  const term = $derived(kind === 'utilization' ? '가동률' : '사용률');
</script>

<!-- role 을 명시한다: this 가 동적이라 컴파일러는 "클릭 핸들러가 있을 때만 button 이 된다"는
     관계를 볼 수 없다. button 일 때 role="button" 은 중복이지만 무해하고, div 일 때는 onclick 도
     없으므로 role 도 붙지 않는다(같은 prop 하나로 갈린다) -->
<svelte:element
  this={onclick ? 'button' : 'div'}
  type={onclick ? 'button' : undefined}
  role={onclick ? 'button' : undefined}
  {onclick}
  class="flex flex-col items-center gap-1 rounded-lg p-1 {onclick
    ? 'cursor-pointer transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40'
    : ''}"
  title={onclick ? `${label} ${term} 상세 보기` : undefined}
>
  <svg viewBox="0 0 100 56" class="w-full max-w-[132px]" role="img" aria-label="{label} {term} {clamped}%">
    <!-- 트랙 -->
    <path
      d="M6 50 A44 44 0 0 1 94 50"
      fill="none"
      stroke="currentColor"
      class="text-gray-200"
      stroke-width="8"
      stroke-linecap="round"
    />
    <!-- 값: pathLength=100 이라 dasharray '{clamped} 100' 이 정확히 clamped% 만 채운다(반복 없음) -->
    {#if clamped > 0}
      <path
        d="M6 50 A44 44 0 0 1 94 50"
        pathLength="100"
        fill="none"
        stroke={stroke}
        stroke-width="8"
        stroke-linecap="round"
        stroke-dasharray="{clamped} 100"
        style="transition: stroke-dasharray 0.4s ease, stroke 0.3s ease;"
      />
    {/if}
    <text x="50" y="44" text-anchor="middle" class="fill-gray-900 text-[16px] font-bold">
      {clamped.toFixed(0)}<tspan class="fill-gray-400 text-[9px]">%</tspan>
    </text>
  </svg>
  <div class="text-center leading-tight">
    <p class="text-xs font-medium text-gray-600">{label}</p>
    <p class="text-[10px] text-gray-400">{term}{#if sub}, {sub}{/if}</p>
  </div>
</svelte:element>
