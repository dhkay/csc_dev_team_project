<script lang="ts">
  // 플랫폼 관리자 관리: (app) 그룹이라 PlatformShell + 플랫폼 관리자 가드를 상속, +page.server 에서 ROOT 가드
  import AdminsPage from '$lib/pages/platform/admins/AdminsPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<AdminsPage admins={data.admins} loadError={data.loadError} />
