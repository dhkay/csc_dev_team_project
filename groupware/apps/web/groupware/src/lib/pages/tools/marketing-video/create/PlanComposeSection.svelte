<script lang="ts">
  // 기획서 구성: 만들 기획서 개수 + 기획서당 씬 개수 + 인포그래픽 배제
  // 순수 표현 컴포넌트: 값과 제한은 부모(기획서 생성 모달)가 소유해 prop 으로 내려준다.
  //
  // 인포그래픽 배제 토글은 이 섹션과 함께 움직인다. 따로 버전 플래그를 두지 않는 이유: 그 토글이
  // 없어야 할 버전은 이 섹션 자체가 없는 버전이라 플래그의 꺼진 쪽이 그려질 자리가 없다.
  import { SCENE_COUNT_OPTIONS, type PlanComposeLimit } from '../planComposeOptions';

  interface Props {
    // 내 AI 모델 선택에서 파생된 제한(자체 모델이면 기획서 개수를 묶는다)
    limit: PlanComposeLimit;
    proposalCount: number;
    sceneCount: number;
    excludeInfographic: boolean;
    onChange: (patch: {
      proposalCount?: number;
      sceneCount?: number;
      excludeInfographic?: boolean;
    }) => void;
  }
  let { limit, proposalCount, sceneCount, excludeInfographic, onChange }: Props = $props();
</script>

<section class="flex flex-col gap-3">
  <div class="flex items-baseline justify-between gap-2">
    <h3 class="text-sm font-medium text-fg">기획서 구성</h3>
    <span class="text-xs text-fg-subtle">기획서 개수와 기획서당 씬 개수를 선택합니다</span>
  </div>

  <!-- 인포그래픽 배제: 켜면 LLM 이 인포그래픽 씬을 만들지 않는다(감성/스토리형에 적합) -->
  <button
    type="button"
    role="switch"
    aria-checked={excludeInfographic}
    onclick={() => onChange({ excludeInfographic: !excludeInfographic })}
    class="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-left transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
  >
    <span class="flex min-w-0 flex-col">
      <span class="text-sm text-fg">인포그래픽 배제</span>
      <span class="text-xs text-fg-subtle">켜면 정보 정리형(체크리스트/비교/단계) 씬 없이 생성합니다</span>
    </span>
    <span
      class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition {excludeInfographic
        ? 'bg-fg'
        : 'bg-line'}"
    >
      <span
        class="inline-block h-4 w-4 transform rounded-full bg-surface shadow transition {excludeInfographic
          ? 'translate-x-4'
          : 'translate-x-0.5'}"
      ></span>
    </span>
  </button>

  <div class="flex flex-col gap-1.5">
    <span class="text-xs text-fg-subtle">기획서 개수</span>
    <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="기획서 개수">
      {#each limit.proposalCounts as n (n)}
        <button
          type="button"
          role="radio"
          aria-checked={proposalCount === n}
          onclick={() => onChange({ proposalCount: n })}
          class="inline-flex min-w-9 items-center justify-center rounded-full px-3 py-1 text-sm tabular-nums transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 {proposalCount ===
          n
            ? 'bg-fg text-surface'
            : 'border border-line text-fg-subtle hover:text-fg'}"
        >
          {n}
        </button>
      {/each}
    </div>

    <!-- 왜 1개뿐인지 그 자리에서 알려준다. 선택지가 사라진 이유를 모르면 고장으로 읽힌다. -->
    {#if limit.limited}
      <p class="flex items-start gap-1.5 text-xs leading-relaxed text-fg-subtle">
        <svg
          class="mt-0.5 h-3.5 w-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01M11 12h1v4h1" />
        </svg>
        <span>
          <span class="font-medium text-fg">{limit.internalModelLabels.join(', ')}</span>
          은(는) 사내 GPU를 조직 전체가 함께 쓰기 때문에 기획서를 한 번에 1개만 만듭니다. 여러 개가
          필요하면 설정에서 외부 모델을 선택하세요. (씬 개수는 그대로 고를 수 있습니다.)
        </span>
      </p>
    {/if}
  </div>

  <div class="flex flex-col gap-1.5">
    <span class="text-xs text-fg-subtle">기획서당 씬 개수</span>
    <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="기획서당 씬 개수">
      {#each SCENE_COUNT_OPTIONS as n (n)}
        <button
          type="button"
          role="radio"
          aria-checked={sceneCount === n}
          onclick={() => onChange({ sceneCount: n })}
          class="inline-flex min-w-9 items-center justify-center rounded-full px-3 py-1 text-sm tabular-nums transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 {sceneCount ===
          n
            ? 'bg-fg text-surface'
            : 'border border-line text-fg-subtle hover:text-fg'}"
        >
          {n}
        </button>
      {/each}
    </div>
  </div>
</section>
