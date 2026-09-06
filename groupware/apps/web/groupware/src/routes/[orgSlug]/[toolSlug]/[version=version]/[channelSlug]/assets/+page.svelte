<script lang="ts">
  // 에셋: 세트/자산 전환 토글 패널. 뷰/탭 상태는 패널이 소유. 데이터/canManage 는 +page.server.ts 로드분
  import AssetsPanel from '$lib/pages/tools/marketing-video/assets/AssetsPanel.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<AssetsPanel
  commonAssets={data.commonAssets}
  assetSets={data.assetSets}
  canManage={data.canManage}
  axes={data.axes}
/>
