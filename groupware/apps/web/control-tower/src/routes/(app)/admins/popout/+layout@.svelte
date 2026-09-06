<script lang="ts">
  // 팝아웃 베어 레이아웃: `@`(루트 리셋)로 PlatformShell 크롬을 건너뛴다.
  // 상위 (app)/+layout.server.ts 가드 load 는 그대로 실행되어 isPlatformAdmin 검증은 유지된다.
  // (ROOT 전용 검증은 각 팝아웃 +page.server.ts 에서 별도 수행)
  let { children }: { children: import('svelte').Snippet } = $props();
</script>

<div class="flex h-dvh flex-col bg-white">
  {@render children()}
</div>
