<script lang="ts">
  // 직원조회 팝아웃 페이지: page 컴포넌트를 그대로 렌더(얇은 라우트). 데이터는 +page.server.ts(SSR)
  import EmployeeDirectory from '$lib/pages/admin/employee-directory/EmployeeDirectoryPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<EmployeeDirectory
  members={data.members}
  departments={data.departments}
  orgName={data.orgName}
  loadError={data.loadError}
/>
