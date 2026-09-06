<script lang="ts">
  // 드래그해서 올리기: 목록 영역을 감싼다.
  //
  // 드래그 상태를 boolean 이 아니라 깊이 카운터로 세는 이유: dragleave 는 포인터가 자식 요소로
  // 넘어갈 때도 발생한다. boolean 이면 드래그 중에 오버레이가 깜빡인다.
  import type { Snippet } from 'svelte';

  interface Props {
    enabled: boolean;
    onFiles: (files: File[]) => void;
    children: Snippet;
  }
  let { enabled, onFiles, children }: Props = $props();

  let depth = $state(0);
  const active = $derived(enabled && depth > 0);

  function reset(): void {
    depth = 0;
  }
</script>

<!-- 넓은 화면에서만 남은 높이를 채운다. 좁은 화면은 문서 스크롤에 맡긴다. -->
<div
  class="relative flex flex-col lg:min-h-0 lg:flex-1"
  ondragenter={(e) => {
    if (!enabled) return;
    e.preventDefault();
    depth += 1;
  }}
  ondragover={(e) => {
    // preventDefault 를 해야 드롭이 허용된다. 권한이 없으면 하지 않아 브라우저 기본 금지 커서가 뜬다.
    if (enabled) e.preventDefault();
  }}
  ondragleave={() => {
    if (!enabled) return;
    depth = Math.max(0, depth - 1);
  }}
  ondrop={(e) => {
    if (!enabled) return;
    e.preventDefault();
    reset();
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) onFiles(files);
  }}
  role="presentation"
>
  {@render children()}

  {#if active}
    <div
      class="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-accent-fg bg-accent-bg/60"
    >
      <p class="text-sm font-medium text-accent-fg">여기에 놓으면 업로드됩니다</p>
    </div>
  {/if}
</div>
