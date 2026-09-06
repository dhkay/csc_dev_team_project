<script lang="ts">
  // 로그(관리급 전용): 셸(nav)은 상위 레이아웃, 화면은 LogPage.
  //   채널/사용자 이름 선택지는 SSR 로드(+page.server.ts)가 넘긴다(레코드엔 id 만 있다)
  import LogPage from '$lib/pages/tools/marketing-video/log/LogPage.svelte';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();
</script>

<LogPage channels={data.channels} members={data.members} />
