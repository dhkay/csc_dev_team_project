<script lang="ts">
  import type { MemberSummary } from '$lib/features/members/types';

  // 일반관리자(ADMIN) 목록: 행 클릭 시 상세(편집/비번재설정/삭제) 팝아웃을 연다.
  // 슈퍼관리자(ROOT)는 표시하지 않는다(페이지에서 필터: 소유자라 자명)
  // 목록이 전부 일반관리자라 역할 뱃지는 군더더기 → 표시하지 않는다.
  interface Props {
    members: MemberSummary[];
    // departmentId → 부서명(소속 표시)
    deptName?: Map<number, string>;
    onselect: (m: MemberSummary) => void;
  }
  let { members, deptName = new Map(), onselect }: Props = $props();

  const soksok = (m: MemberSummary): string =>
    m.departmentId != null ? (deptName.get(m.departmentId) ?? '소속 부서') : '미배치';
</script>

{#if members.length === 0}
  <p class="px-4 py-8 text-center text-sm text-gray-500">등록된 일반관리자가 없습니다.</p>
{:else}
  <ul class="divide-y divide-gray-100">
    {#each members as member (member.id)}
      <li>
        <button
          type="button"
          onclick={() => onselect(member)}
          class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
        >
          <div class="min-w-0">
            <div class="truncate font-medium text-gray-900">{member.name}</div>
            <div class="truncate text-xs text-gray-500">{member.email}</div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span class="text-xs text-gray-400">{soksok(member)}</span>
          </div>
        </button>
      </li>
    {/each}
  </ul>
{/if}
