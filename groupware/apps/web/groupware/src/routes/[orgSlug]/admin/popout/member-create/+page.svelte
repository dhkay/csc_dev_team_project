<script lang="ts">
  // 일반관리자 추가 팝아웃: feature 페이지 컴포넌트를 그대로 렌더(얇은 라우트)
  import MemberCreate from '$lib/pages/admin/user-management/MemberCreatePage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<MemberCreate departments={data.departments} />
