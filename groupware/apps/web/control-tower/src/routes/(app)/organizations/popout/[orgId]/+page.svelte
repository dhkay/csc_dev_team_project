<script lang="ts">
  // 조직 상세 팝아웃 페이지: 서버 load 가 내려준 org 를 컴포넌트에 전달
  import OrganizationDetail from '$lib/pages/platform/organizations/OrganizationDetailPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<OrganizationDetail org={data.org} aiToolsCatalog={data.aiToolsCatalog} />
