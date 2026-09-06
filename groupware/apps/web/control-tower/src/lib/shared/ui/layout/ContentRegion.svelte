<script lang="ts">
  import type { Snippet } from 'svelte';

  // 콘텐츠 영역: 셸 내부 페이지 스크롤 콘텐츠를 담는다(플로팅 윈도우와 무관한 일반 레이아웃)
  let { contentClass = 'p-4', children }: { contentClass?: string; children: Snippet } = $props();
</script>

<div class="relative min-h-0 flex-1 overflow-hidden">
  <!-- 페이지 콘텐츠 (스크롤) -->
  <div class="absolute inset-0 overflow-auto {contentClass}">
    {@render children()}
  </div>
</div>
