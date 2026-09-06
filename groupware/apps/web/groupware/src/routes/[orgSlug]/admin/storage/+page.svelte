<script lang="ts">
  // /[orgSlug]/admin/storage 콘텐츠: 스토리지 페이지
  import StoragePage from '$lib/pages/admin/storage/StoragePage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<StoragePage
  actor={data.actor}
  departments={data.departments}
  roster={data.roster}
  loadError={data.loadError}
/>
