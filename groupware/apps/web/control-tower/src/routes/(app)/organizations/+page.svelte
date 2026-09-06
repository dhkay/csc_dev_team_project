<script lang="ts">
  // 플랫폼 조직 관리: (app) 그룹이라 PlatformShell + 플랫폼 관리자 가드를 상속받는다.
  import OrganizationsPage from '$lib/pages/platform/organizations/OrganizationsPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<OrganizationsPage organizations={data.organizations} loadError={data.loadError} />
