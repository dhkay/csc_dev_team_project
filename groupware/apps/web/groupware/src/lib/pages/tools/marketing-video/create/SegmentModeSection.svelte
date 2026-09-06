<script lang="ts">
  // 세그먼트 연결 방식: 씬(=세그먼트)들을 어떻게 만들어 이어붙일지
  //
  // 영상 모델 선택 아래에 둔다. 무엇으로 만들지를 정한 뒤에야 어떻게 이어붙일지가 말이 된다.
  //
  // 두 갈래뿐이라 드롭다운으로 접지 않는다. 고를 때 봐야 하는 것이 이름이 아니라 대가
  //   (빠름 ↔ 흐름)라, 두 설명이 나란히 보여야 비교가 된다.
  //
  // 목록과 문구는 카탈로그(planComposeOptions)가 갖는다. 방식을 늘리면 이 파일은 그대로다.
  import { SEGMENT_MODES, type SegmentMode } from '../planComposeOptions';

  interface Props {
    value: SegmentMode;
    onSelect: (mode: SegmentMode) => void;
  }
  let { value, onSelect }: Props = $props();
</script>

<section class="flex flex-col gap-2">
  <h4 class="text-sm font-semibold text-fg">세그먼트 연결 방식</h4>

  <!-- radiogroup: 패널이 바뀌는 탭이 아니라 둘 중 하나를 고르는 설정이다. -->
  <div
    class="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2"
    role="radiogroup"
    aria-label="세그먼트 연결 방식"
  >
    {#each SEGMENT_MODES as mode (mode.key)}
      {@const on = value === mode.key}
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onclick={() => onSelect(mode.key)}
        class="flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 {on
          ? 'border-fg bg-success-bg'
          : 'border-line bg-elevated hover:bg-hover'}"
      >
        <span
          class="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border {on
            ? 'border-fg'
            : 'border-line'}"
        >
          {#if on}<span class="h-1.5 w-1.5 rounded-full bg-fg"></span>{/if}
        </span>
        <span class="min-w-0">
          <span class="truncate text-sm font-medium text-fg">{mode.label}</span>
          <span class="mt-0.5 block text-[11px] leading-snug text-fg-subtle">{mode.description}</span>
        </span>
      </button>
    {/each}
  </div>
</section>
