<script lang="ts">
  // 서버 관리(모니터링): (app) 그룹이라 PlatformShell + 플랫폼 관리자 가드를 상속받는다(추가로 ROOT 가드는 로더에서)
  import ServersPage from '$lib/pages/platform/servers/ServersPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<ServersPage servers={data.servers} loadError={data.loadError} />
