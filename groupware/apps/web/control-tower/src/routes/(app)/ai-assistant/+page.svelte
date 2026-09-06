<script lang="ts">
  // 플랫폼 AI 어시스턴트 전역 설정: (app) 그룹이라 PlatformShell + 플랫폼 관리자 가드를 상속(추가 ROOT 가드)
  import AiAssistantPage from '$lib/pages/platform/ai-assistant/AiAssistantPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<AiAssistantPage settings={data.settings} />
