<script lang="ts">
  import ProcessPage from '$lib/pages/tools/marketing-video/process/ProcessPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<ProcessPage
  process={data.process}
  channelId={data.channelId}
  version={data.version}
  canEdit={data.canEdit}
/>
