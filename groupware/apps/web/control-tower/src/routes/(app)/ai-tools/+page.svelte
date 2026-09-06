<script lang="ts">
  // 플랫폼 AI도구 관리: (app) 그룹이라 PlatformShell + 플랫폼 관리자 가드를 상속받는다.
  import AiToolsPage from '$lib/pages/platform/ai-tools/AiToolsPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<AiToolsPage
  aiTools={data.aiTools}
  loadError={data.loadError}
  commonAssets={data.commonAssets}
  assetSets={data.assetSets}
  axes={data.axes}
/>
