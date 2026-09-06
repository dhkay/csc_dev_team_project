<script lang="ts">
  import type { OrganizationSummary } from '$lib/features/organizations/types';
  import { formatDate } from '$lib/features/organizations/lib/date';
  import OrganizationStatusBadge from './OrganizationStatusBadge.svelte';
  import OrganizationAvatar from './OrganizationAvatar.svelte';

  // 모바일/세로(portrait)용 조직 카드: 테이블이 가로로 넘치지 않도록 목록을 카드로 표현
  // 클릭 시 onclick 으로 상세 창을 연다.
  let { org, onclick }: { org: OrganizationSummary; onclick?: () => void } = $props();
</script>

<button
  type="button"
  {onclick}
  class="block w-full rounded-lg border border-gray-200 bg-white p-4 text-left hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/60"
>
  <div class="flex items-start justify-between gap-3">
    <div class="flex min-w-0 items-center gap-3">
      <OrganizationAvatar name={org.name} profileImageUrl={org.profileImageUrl} sizeClass="h-10 w-10" fit="contain" />
      <div class="min-w-0">
        <h3 class="truncate font-semibold text-gray-900">{org.name}</h3>
        <p class="truncate text-sm text-gray-500">/{org.slug}</p>
      </div>
    </div>
    <OrganizationStatusBadge status={org.status} />
  </div>

  <dl class="mt-3 text-sm">
    <div>
      <dt class="text-gray-400">생성일</dt>
      <dd class="text-gray-700">{formatDate(org.createdAt)}</dd>
    </div>
  </dl>
</button>
