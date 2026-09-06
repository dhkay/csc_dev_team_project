<script lang="ts">
  // 팝아웃 베어 레이아웃: `@`(루트 리셋)로 AdminShell 크롬을 건너뛴다.
  // 상위 [orgSlug]/admin/+layout.server.ts 가드 load 는 그대로 실행되어 인증/슬러그 검증은 유지된다.
  // OS 창 크롬(타이틀/닫기)이 이미 있으므로 내부 셸은 최소화한다.
  let { children }: { children: import('svelte').Snippet } = $props();
</script>

<div class="flex h-dvh flex-col bg-white">
  {@render children()}
</div>
