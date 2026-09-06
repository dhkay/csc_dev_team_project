<script lang="ts">
  // 생성 진행상태: 생성 모달이 '영상 생성' 이후에 보여주는 화면. 모달 헤더가 제목을 이미 갖고 있어
  //   본문은 설명 한 줄로 시작한다.
  //
  // 이 화면은 값을 만들지 않는다. GenerationProgress 하나를 받아 그리기만 한다. 그래서 지금은 dev 목이,
  //   나중에는 서버 값이 같은 자리를 채운다(그때 이 파일은 바뀌지 않는다)
  //   칸이 없을 때 무엇을 적는지도 뷰모델(generationProgress)이 단계별로 정한다.
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import Spinner from '$lib/shared/ui/Spinner.svelte';
  import SegmentStatusCard from './SegmentStatusCard.svelte';
  import SegmentRegenerateModal from './SegmentRegenerateModal.svelte';
  import {
    awaitingSegmentsNotice,
    awaitsSegments,
    doneCount,
    elapsedLabel,
    isComplete,
    overallPercent,
    stageLabel,
    type GenerationProgress,
    type SegmentProgress,
  } from '../generationProgress';

  interface Props {
    progress: GenerationProgress;
    // 이 창이 만드는 버전. 세그먼트 카드의 상자 비율이 여기서 나온다.
    version: VersionMode;
    // 세그먼트 하나를 고친 프롬프트로 다시 만든다. 주지 않으면 카드가 재생성 버튼을 그리지 않는다.
    //
    // 카드의 버튼은 곧바로 이것을 부르지 않는다. 먼저 프롬프트를 고치는 창이 열리고, 거기서 시작을
    // 눌러야 여기까지 온다. 고칠 수 없는 재생성은 같은 입력으로 같은 일을 다시 시키는 것이다.
    onRegenerateSegment?: (order: number, prompt: string) => void;
  }
  let { progress, version, onRegenerateSegment }: Props = $props();

  /** 프롬프트를 고치는 중인 세그먼트. 창이 닫혀 있으면 null. */
  let regenerateTarget = $state<SegmentProgress | null>(null);
  let regenerateOpen = $state(false);

  function openRegenerate(segment: SegmentProgress): void {
    regenerateTarget = segment;
    regenerateOpen = true;
  }

  // 경과 시간은 값이 바뀌지 않아도 계속 흘러야 한다(멈춘 시계는 생성이 멈춘 것처럼 보인다)
  //   끝나면 함께 멈춘다. 끝난 작업의 경과 시간이 계속 늘면 아직 도는 것처럼 읽힌다.
  let now = $state(Date.now());
  $effect(() => {
    if (complete) return;
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const percent = $derived(overallPercent(progress));
  const complete = $derived(isComplete(progress));
  const done = $derived(doneCount(progress));
  const total = $derived(progress.segments.length);
  const awaiting = $derived(awaitsSegments(progress));
  const startedLabel = $derived(
    new Date(progress.startedAt).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  );
</script>

<div class="flex flex-col gap-5">
  <!-- 닫기와 취소의 차이는 취소 버튼 옆(모달 푸터)에서 말한다. 같은 말을 두 번 적지 않는다. -->
  <p class="text-xs leading-relaxed text-fg-subtle">
    {#if complete}
      모든 세그먼트가 만들어졌습니다. 마음에 들지 않는 세그먼트는 여기서 다시 만들 수 있습니다.
    {:else}
      영상을 만드는 중입니다. 다 만들어진 뒤 마지막 단계에서 워크스페이스에 배치합니다.
    {/if}
  </p>

  <!-- 진행 요약: 지금 어느 단계인지 + 전체가 얼마나 왔는지 + 언제 시작해 얼마나 지났는지 -->
  <section class="flex flex-col gap-3 rounded-xl border border-line bg-elevated p-4">
    <div class="flex items-center justify-between gap-2">
      <span class="rounded-full bg-accent-bg px-2.5 py-1 text-[11px] font-medium text-accent-fg">
        {stageLabel(progress.stage)}
      </span>
      <span class="text-sm font-semibold tabular-nums text-fg">{percent}%</span>
    </div>

    <!-- 진행 바: 스토리지 업로드 패널과 같은 모양(h-1.5 트랙 + bg-brand 채움)을 쓴다. -->
    <div
      class="h-1.5 w-full overflow-hidden rounded-full bg-elevated ring-1 ring-line"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="전체 진행률"
    >
      <div class="h-full rounded-full bg-brand transition-[width]" style="width: {percent}%"></div>
    </div>

    <dl class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <div class="flex items-center justify-between gap-2">
        <dt class="text-fg-subtle">세그먼트</dt>
        <!-- 모르는 수를 0 으로 적지 않는다. "0 / 0 완료" 는 만들 것이 없다는 말로 읽힌다. -->
        <dd class="flex items-center gap-1 tabular-nums font-medium text-fg">
          {#if awaiting}
            <Spinner class="h-3 w-3 text-fg-subtle" />
            계산 중
          {:else}
            {done} / {total} 완료
          {/if}
        </dd>
      </div>
      <div class="flex items-center justify-between gap-2">
        <dt class="text-fg-subtle">경과 시간</dt>
        <dd class="tabular-nums font-medium text-fg">
          {elapsedLabel(progress.startedAt, now)}
        </dd>
      </div>
      <div class="flex items-center justify-between gap-2">
        <dt class="text-fg-subtle">시작 시각</dt>
        <dd class="tabular-nums font-medium text-fg">{startedLabel}</dd>
      </div>
    </dl>
  </section>

  <section class="flex flex-col gap-2">
    <h3 class="text-xs font-medium text-fg-muted">세그먼트</h3>
    {#if awaiting}
      <!-- 칸이 하나씩 생기지 않는다. 나누기가 끝나 프로젝트가 만들어지면 칸이 한 번에 나타난다.
           빈 격자에 인디케이터와 그 단계의 말을 두어야 멈춘 것으로 읽히지 않는다. -->
      <div
        class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-3 py-8 text-center"
      >
        <Spinner class="h-6 w-6 text-fg-subtle" label="세그먼트 계산 중" />
        <p class="max-w-sm text-xs leading-relaxed text-fg-subtle">
          {awaitingSegmentsNotice(progress.stage)}
        </p>
      </div>
    {:else}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
        {#each progress.segments as segment (segment.order)}
          <SegmentStatusCard
            {segment}
            {version}
            onRegenerate={onRegenerateSegment ? () => openRegenerate(segment) : undefined}
          />
        {/each}
      </div>
    {/if}
  </section>
</div>

<!-- 프롬프트를 고치는 창. 카드의 '재생성' 이 이것을 열고, 여기서 시작을 눌러야 실제로 다시 만든다. -->
{#if onRegenerateSegment}
  <SegmentRegenerateModal
    bind:open={regenerateOpen}
    segment={regenerateTarget}
    total={total}
    onConfirm={onRegenerateSegment}
  />
{/if}
