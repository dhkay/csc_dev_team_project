<script lang="ts">
  import AiAssistantSettingsPage from '$lib/pages/admin/ai-assistant/AiAssistantSettingsPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<AiAssistantSettingsPage settings={data.settings} models={data.models} />
