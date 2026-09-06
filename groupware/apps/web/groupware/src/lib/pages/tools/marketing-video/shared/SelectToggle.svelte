<script lang="ts">
  // 다중 선택 체크박스: 삭제 모드에서 타일/카드 우상단에 뜬다. 체크 = 선택(누적), 최종 삭제는 하단 바에서
  //   기획안 타일/영상 카드가 공유(톤 일관). 부모 컨테이너가 relative 여야 우상단에 절대배치된다.
  interface Props {
    checked: boolean;
    onToggle: () => void;
    label?: string;
  }
  let { checked, onToggle, label = '선택' }: Props = $props();
</script>

<button
  type="button"
  role="checkbox"
  aria-checked={checked}
  aria-label={label}
  onclick={(e) => {
    e.stopPropagation();
    onToggle();
  }}
  class="absolute right-1 top-1 z-30 flex h-6 w-6 items-center justify-center rounded-full border-2 shadow transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 {checked
    ? 'border-fg bg-fg text-surface'
    : 'border-white/80 bg-black/35 text-transparent hover:bg-black/50'}"
>
  <svg
    class="h-3.5 w-3.5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="3"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
</button>
