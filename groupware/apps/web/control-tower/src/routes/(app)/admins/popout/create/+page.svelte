<script lang="ts">
  // 관리자 추가 팝아웃 페이지: feature 컴포넌트를 그대로 렌더(얇은 라우트)
  import AdminCreate from '$lib/pages/platform/admins/AdminCreatePage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<AdminCreate catalog={data.catalog} />
