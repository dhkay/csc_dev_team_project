<script lang="ts">
  // 환경설정 팝아웃 페이지: 서버 load 가 내려준 user 를 컴포넌트에 전달
  import AccountSettingsPage from '$lib/pages/admin/account-settings/AccountSettingsPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<AccountSettingsPage user={data.user} />
