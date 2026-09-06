<script lang="ts">
  import { formatDate } from '$lib/features/organizations/lib/date';
  import { accountStatusLabel } from '$lib/shared/lib/utils/accountStatus';
  import type { AdminSummary } from '$lib/features/admins/types';

  // 관리자 목록 행: 클릭하면 상세(옵션/삭제) 팝아웃을 연다. 루트는 삭제 불가(상세에서 안내)
  let { items, onselect }: { items: AdminSummary[]; onselect: (a: AdminSummary) => void } = $props();
</script>

<ul class="divide-y divide-gray-100">
  {#each items as admin (admin.id)}
    <li>
      <button
        type="button"
        onclick={() => onselect(admin)}
        class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
          {admin.name.slice(0, 1)}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="truncate font-medium text-gray-900">{admin.name}</span>
            <span
              class="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold {admin.role === 'ROOT'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-600'}"
            >
              {admin.role === 'ROOT' ? '루트' : '일반'}
            </span>
          </div>
          <p class="truncate text-sm text-gray-500">{admin.email}</p>
        </div>
        <div class="hidden shrink-0 text-right text-xs text-gray-400 sm:block">
          <p>{accountStatusLabel(admin.status)}</p>
          <p>가입 {formatDate(admin.createdAt)}</p>
        </div>
      </button>
    </li>
  {/each}
</ul>
