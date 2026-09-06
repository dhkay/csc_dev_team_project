<script lang="ts">
  // 세그먼트 하나를 다시 만들기 전에 그 프롬프트를 고치는 창
  //
  // 바로 다시 만들지 않는 이유. 고칠 수 없으면 재생성은 같은 입력으로 같은 일을 다시 시키는
  //   것이다. 실패한 세그먼트에서는 대개 같은 이유로 다시 실패하고, 마음에 들지 않아 누른
  //   경우에는 마음에 들지 않는 것이 한 번 더 나온다. 무엇을 바꿔 다시 만들지 정하는 것이 그
  //   버튼의 쓸모라, 그 자리를 먼저 연다.
  //
  // 중첩 CenterModal 이다. 그 컴포넌트가 스택을 다루므로(최상단만 Esc/Tab) 확인 창을 따로 만들지 않는다.
  import CenterModal from '$lib/shared/ui/CenterModal.svelte';
  import { durationLabel } from '../generationResult';
  import type { SegmentProgress } from '../generationProgress';

  interface Props {
    // 표시 여부(bindable)
    open?: boolean;
    // 다시 만들 세그먼트. 닫혀 있으면 null.
    segment: SegmentProgress | null;
    // 전체 세그먼트 수. '전체 중 N번째' 를 적는 데 쓴다.
    total: number;
    // 고친 프롬프트로 재생성을 시작한다.
    onConfirm: (order: number, prompt: string) => void;
  }
  let { open = $bindable(false), segment, total, onConfirm }: Props = $props();

  /**
   * 벤더가 받는 프롬프트 길이. 입력을 막는 값이 아니다.
   *
   * 이 칸의 글은 기획 LLM 을 거치지 않고 영상 모델로 바로 나간다. 벤더 상한이 2500자이고 렌더는
   * 대사가 들어갈 자리를 남기려고 화면 묘사를 2400자에서 먼저 줄인다(`compose.py`).
   *
   * 그래서 막지 않는 대신 넘었다는 사실만 알린다. 막으면 적고 싶은 것을 적을 수 없고, 아무 말도
   * 하지 않으면 넘긴 만큼이 조용히 잘려 그 사실이 결과 영상에서만 드러난다.
   */
  const VENDOR_BUDGET = 2400;

  let prompt = $state('');
  /** 창을 연 세그먼트. 이 값이 바뀔 때만 입력을 다시 채운다(타이핑 중에 덮어쓰지 않게) */
  let loadedOrder = $state<number | null>(null);

  // 다른 세그먼트로 창이 열리면 그 세그먼트의 프롬프트를 채운다. placeholder 가 아니라 값으로
  //   넣는다: 이 창의 제목이 '수정' 이고, placeholder 로 두면 고칠 수 없고 통째로 다시 적어야 한다.
  $effect(() => {
    if (!open || !segment) return;
    if (loadedOrder === segment.order) return;
    loadedOrder = segment.order;
    prompt = segment.prompt ?? '';
  });

  // 닫히면 다음 열기에서 다시 채우도록 표시를 지운다.
  $effect(() => {
    if (!open) loadedOrder = null;
  });

  const used = $derived(prompt.trim().length);
  /** 벤더가 받는 길이를 넘었는가. 막지 않고 알리기만 한다(위 VENDOR_BUDGET 주석) */
  const over = $derived(used > VENDOR_BUDGET);
  const canStart = $derived(used > 0);

  const STATUS_BADGE: Record<SegmentProgress['status'], { label: string; cls: string }> = {
    done: { label: '완료', cls: 'bg-success-bg text-success-fg' },
    running: { label: '생성중', cls: 'bg-accent-bg text-accent-fg' },
    waiting: { label: '대기', cls: 'bg-hover text-fg-subtle' },
  };

  function start(): void {
    if (!segment || !canStart) return;
    onConfirm(segment.order, prompt.trim());
    open = false;
  }
</script>

<CenterModal bind:open title="세그먼트 재생성" size="md">
  {#if segment}
    {@const badge = STATUS_BADGE[segment.status]}
    <div class="flex flex-col gap-4">
      <p class="text-xs leading-relaxed text-fg-subtle">
        해당 세그먼트의 프롬프트를 수정한 뒤 재생성을 시작할 수 있습니다.
      </p>

      <!-- 무엇을 다시 만드는지. 격자에서 칸 하나를 눌러 들어왔으므로 그 칸이 무엇이었는지 다시 말한다. -->
      <div class="flex flex-col gap-1 border-y border-line py-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-medium text-fg">
            대상: 세그먼트 {segment.order}
            <span class="font-normal text-fg-subtle">
              ({#if segment.durationSec != null}{durationLabel(segment.durationSec)} 구간, {/if}전체
              중 {segment.order}번째)
            </span>
          </span>
          <span class="rounded px-1.5 py-0.5 text-[10px] font-medium {badge.cls}">
            {badge.label}
          </span>
        </div>
      </div>

      <section class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-fg" for="segment-regenerate-prompt">
          프롬프트 수정
        </label>
        <textarea
          id="segment-regenerate-prompt"
          bind:value={prompt}
          rows="6"
          placeholder="이 세그먼트를 어떻게 만들지 적습니다."
          class="w-full resize-y rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm leading-relaxed text-fg placeholder:text-fg-subtle/70 transition focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15"
        ></textarea>
        <!-- 안내는 왼쪽, 적은 글자 수는 오른쪽(사용자 입력사항 칸과 같은 규칙)
             상한이 없으므로 적은 글자를 센다. 벤더 예산을 넘으면 그 사실만 덧붙인다: 막지는 않고
             (적고 싶은 것을 적을 수 있어야 한다) 조용히 잘리지도 않게 -->
        <div class="flex items-baseline justify-between gap-3 text-[11px] text-fg-subtle">
          <span>공백만 입력 시 시작할 수 없습니다</span>
          <span class="shrink-0 tabular-nums" class:text-amber-600={over}>{used}자</span>
        </div>
        {#if over}
          <p class="text-[11px] leading-relaxed text-amber-600">
            영상 모델이 받는 길이({VENDOR_BUDGET}자)를 넘었습니다. 넘은 부분은 만들 때 잘립니다.
          </p>
        {/if}
      </section>
    </div>
  {/if}

  {#snippet footer()}
    <div class="flex gap-2">
      <button
        type="button"
        onclick={() => (open = false)}
        class="flex-1 rounded-full border border-line px-5 py-2 text-sm font-medium text-fg-muted transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/20"
      >
        취소
      </button>
      <button
        type="button"
        onclick={start}
        disabled={!canStart}
        class="flex-1 rounded-full bg-fg px-5 py-2 text-sm font-medium text-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        재생성 시작
      </button>
    </div>
  {/snippet}
</CenterModal>
