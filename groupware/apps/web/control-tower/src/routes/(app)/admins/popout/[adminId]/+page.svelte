<script lang="ts">
  // 관리자 상세 팝아웃 페이지: 서버 load 가 내려준 admin/catalog/features 를 컴포넌트에 전달
  import AdminDetail from '$lib/pages/platform/admins/AdminDetailPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<AdminDetail admin={data.admin} catalog={data.catalog} features={data.features} />
