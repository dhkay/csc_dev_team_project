<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import type { MemberSummary } from '$lib/features/members/types';
  import { membersService } from '$lib/features/members/services/members.service';

  // 삭제(soft-delete=WITHDRAWN)된 일반관리자 목록: 단계적 삭제 2단계(완전삭제)
  // 영구 삭제는 복구 불가라 행마다 인라인 확인을 거친다. 성공 시 목록(활성+탈퇴) 전체 새로고침
  interface Props {
    members: MemberSummary[];
  }
  let { members }: Props = $props();

  let confirmingId = $state<number | null>(null);
  let busyId = $state<number | null>(null);
  let errorMsg = $state('');

  function startConfirm(id: number): void {
    confirmingId = id;
    errorMsg = '';
  }
  function cancel(): void {
    confirmingId = null;
  }

  async function purge(id: number): Promise<void> {
    busyId = id;
    errorMsg = '';
    const res = await membersService.purge(id);
    busyId = null;
    if (res.success) {
      confirmingId = null;
      await invalidateAll(); // 활성/탈퇴 목록 동시 갱신
    } else {
      errorMsg = res.error ?? '영구 삭제에 실패했습니다.';
    }
  }
</script>

{#if members.length === 0}
  <p class="px-4 py-8 text-center text-sm text-gray-500">삭제된 사용자가 없습니다.</p>
{:else}
  <ul class="divide-y divide-gray-100">
    {#each members as member (member.id)}
      <li class="px-4 py-3">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="truncate font-medium text-gray-500 line-through">{member.name}</div>
            <div class="truncate text-xs text-gray-400">{member.email}</div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">삭제됨</span>
            {#if confirmingId !== member.id}
              <button
                type="button"
                class="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                onclick={() => startConfirm(member.id)}
              >
                완전삭제
              </button>
            {/if}
          </div>
        </div>

        {#if confirmingId === member.id}
          <div class="mt-2 flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2">
            <p class="text-xs text-red-700">
              영구 삭제하면 <strong>복구할 수 없습니다.</strong> 이메일({member.email})을 다시 사용할 수 있게 됩니다.
            </p>
            <div class="flex shrink-0 items-center gap-2">
              <button
                type="button"
                class="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                disabled={busyId === member.id}
                onclick={() => purge(member.id)}
              >
                {busyId === member.id ? '삭제 중…' : '완전삭제'}
              </button>
              <button
                type="button"
                class="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                disabled={busyId === member.id}
                onclick={cancel}
              >
                취소
              </button>
            </div>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

{#if errorMsg}
  <p class="px-4 pb-3 text-center text-xs text-red-600">{errorMsg}</p>
{/if}
