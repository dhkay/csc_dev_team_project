<script lang="ts">
  import UserManagementPage from '$lib/pages/admin/user-management/UserManagementPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<UserManagementPage
  members={data.members}
  departments={data.departments}
  withdrawnMembers={data.withdrawnMembers}
  loadError={data.loadError}
/>
