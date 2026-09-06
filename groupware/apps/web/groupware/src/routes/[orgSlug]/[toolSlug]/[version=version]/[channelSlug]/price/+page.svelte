<script lang="ts">
  import PricePage from '$lib/pages/tools/marketing-video/price/PricePage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<PricePage
  version={data.version}
  canManageCredentials={data.canManageCredentials}
  credentialsHref={data.credentialsHref}
/>
