<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { LayoutData } from './$types';
  import PlatformShell from '$lib/widgets/PlatformShell/PlatformShell.svelte';

  // (app) 그룹 레이아웃: 인증된 PLATFORM 화면을 플랫폼 셸로 감싼다.
  // 보조 창은 네이티브 팝아웃(window.open)으로 띄운다. 셸은 창을 마운트하지 않는다.
  let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<PlatformShell user={data.user}>
  {@render children()}
</PlatformShell>
