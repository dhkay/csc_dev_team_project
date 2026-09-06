<script lang="ts">
  // /[orgSlug]/admin/organization: 조직 관리(슈퍼관리자 전용). 가드/데이터는 +page.server.ts.
  // 기업명은 admin 레이아웃 user.organization, 부서/멤버는 page load(실데이터)를 전달
  import OrganizationManagementPage from '$lib/pages/admin/organization/OrganizationManagementPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<OrganizationManagementPage
  companyName={data.user?.organization?.name ?? null}
  departments={data.departments}
  members={data.members}
  grantMatrix={data.grantMatrix}
  aiToolDistribution={data.aiToolDistribution}
  hasRootAuthority={data.hasRootAuthority}
  isRootRole={data.isRootRole}
  loadError={data.loadError}
/>
