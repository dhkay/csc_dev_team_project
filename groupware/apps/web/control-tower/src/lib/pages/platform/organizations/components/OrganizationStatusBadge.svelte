<script lang="ts">
  import type { OrgStatus } from '$lib/features/organizations/types';

  let { status }: { status: OrgStatus } = $props();

  const META: Record<OrgStatus, { label: string; cls: string }> = {
    ACTIVE: { label: '활성', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
    SUSPENDED: { label: '정지', cls: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
    WITHDRAWN: { label: '탈퇴', cls: 'bg-gray-100 text-gray-500 ring-gray-500/20' },
  };

  const meta = $derived(META[status]);
</script>

<span
  class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset {meta.cls}"
>
  {meta.label}
</span>
