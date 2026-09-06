<script lang="ts">
  import type { OrganizationSummary } from '$lib/features/organizations/types';
  import { formatDate } from '$lib/features/organizations/lib/date';
  import OrganizationCard from './OrganizationCard.svelte';
  import OrganizationStatusBadge from './OrganizationStatusBadge.svelte';
  import OrganizationAvatar from './OrganizationAvatar.svelte';

  // 반응형 목록: 데스크톱은 테이블, 모바일/세로는 카드 리스트
  // 외곽선/배경은 상위 패널이 담당. 행/카드 클릭 시 onselect 로 상세 창을 연다.
  let {
    items,
    onselect,
  }: {
    items: OrganizationSummary[];
    onselect?: (org: OrganizationSummary) => void;
  } = $props();

  function select(org: OrganizationSummary): void {
    onselect?.(org);
  }
</script>

<!-- 데스크톱(≥ md): 테이블 -->
<div class="hidden md:block">
  <table class="min-w-full divide-y divide-gray-200 text-sm">
    <thead class="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
      <tr>
        <th class="px-4 py-3">이름</th>
        <th class="px-4 py-3">slug</th>
        <th class="px-4 py-3">상태</th>
        <th class="px-4 py-3">생성일</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-gray-100">
      {#each items as org (org.id)}
        <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
        <tr
          class="cursor-pointer hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
          role="button"
          tabindex="0"
          aria-label="{org.name} 상세 열기"
          onclick={() => select(org)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              select(org);
            }
          }}
        >
          <td class="px-4 py-3 font-medium text-gray-900">
            <div class="flex items-center gap-2.5">
              <OrganizationAvatar name={org.name} profileImageUrl={org.profileImageUrl} sizeClass="h-8 w-8" fit="contain" />
              <span class="truncate">{org.name}</span>
            </div>
          </td>
          <td class="px-4 py-3 text-gray-500">/{org.slug}</td>
          <td class="px-4 py-3"><OrganizationStatusBadge status={org.status} /></td>
          <td class="px-4 py-3 text-gray-500">{formatDate(org.createdAt)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<!-- 모바일/세로(< md): 카드 리스트 -->
<div class="space-y-3 p-4 md:hidden">
  {#each items as org (org.id)}
    <OrganizationCard {org} onclick={() => select(org)} />
  {/each}
</div>
