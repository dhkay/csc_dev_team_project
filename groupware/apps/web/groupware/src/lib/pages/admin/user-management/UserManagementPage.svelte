<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { invalidateAll } from '$app/navigation';
  import { openPopout } from '@csc/shared-ui/popout';
  import { popouts } from '$lib/shared/lib/popout/popouts';
  import { subscribePopout } from '$lib/shared/lib/popout/popoutChannel';
  import type { MemberSummary } from '$lib/features/members/types';
  import type { Department } from '$lib/features/departments/types';
  import OrganizationUserList from './components/OrganizationUserList.svelte';
  import WithdrawnUserList from './components/WithdrawnUserList.svelte';

  // 사용자 관리(슈퍼관리자 전용): 조직유저(슈퍼관리자+일반관리자) 목록 + 일반관리자 추가/편집/삭제
  // 목록은 +page.server.ts load(ROOT 가드 통과)의 실데이터. 추가/상세는 팝아웃(다른 문서)에서 처리하고,
  // 여기(여는 창)서 변경 알림(BroadcastChannel)을 받아 목록을 새로고침한다.
  // 삭제는 단계적: 1단계 소프트삭제(상세 팝아웃) → '삭제된 사용자' 탭에서 2단계 완전삭제
  interface Props {
    members: MemberSummary[];
    departments?: Department[];
    withdrawnMembers?: MemberSummary[];
    loadError?: boolean;
  }
  let { members, departments = [], withdrawnMembers = [], loadError = false }: Props = $props();

  // 탭: 조직유저(활성) / 삭제된 사용자(탈퇴). 데이터는 둘 다 SSR 로 로드돼 있어 전환만 한다.
  let activeTab = $state<'active' | 'withdrawn'>('active');

  // departmentId → 부서명(목록에서 소속 표시용)
  const deptName = $derived(new Map(departments.map((d) => [d.id, d.name])));

  // 슈퍼관리자(ROOT)는 목록에 표시하지 않는다. 일반관리자(ADMIN)만 노출/관리(소유자라 자명)
  const adminMembers = $derived(members.filter((m) => m.role === 'ADMIN'));

  onMount(() =>
    subscribePopout((msg) => {
      if (msg.type === 'member:changed') invalidateAll();
    }),
  );

  // [orgSlug] 라우트 하위라 항상 존재하지만, params 인덱스 접근은 string|undefined 라 폴백한다.
  const orgSlug = $derived($page.params.orgSlug ?? '');

  function openCreate(): void {
    openPopout(popouts.memberCreate(orgSlug));
  }

  function openDetail(member: MemberSummary): void {
    openPopout(popouts.memberDetail(orgSlug, member.id));
  }
</script>

<div class="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
  <!-- 상위 이동은 서브 앱바 브레드크럼(관리자 › 사용자 관리)이 담당: 인페이지 '뒤로' 제거 -->
  <header>
    <h1 class="text-xl font-bold text-gray-900">사용자 관리</h1>
    <p class="text-sm text-gray-500">조직의 사용자를 관리합니다.</p>
  </header>

  <section class="overflow-hidden rounded-lg border border-gray-200 bg-white">
    <!-- 탭: 조직유저(활성) / 삭제된 사용자(탈퇴) -->
    <div role="tablist" class="flex gap-1 border-b border-gray-200 px-2">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'active'}
        onclick={() => (activeTab = 'active')}
        class="-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors {activeTab ===
        'active'
          ? 'border-[#1868db] text-[#1868db]'
          : 'border-transparent text-gray-500 hover:text-gray-700'}"
      >
        조직유저 <span class="font-normal text-gray-400">({adminMembers.length})</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'withdrawn'}
        onclick={() => (activeTab = 'withdrawn')}
        class="-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors {activeTab ===
        'withdrawn'
          ? 'border-[#1868db] text-[#1868db]'
          : 'border-transparent text-gray-500 hover:text-gray-700'}"
      >
        삭제된 사용자 <span class="font-normal text-gray-400">({withdrawnMembers.length})</span>
      </button>
    </div>

    {#if activeTab === 'active'}
      <div class="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <p class="text-xs text-gray-500">조직의 사용자를 관리합니다.</p>
        <button
          type="button"
          class="shrink-0 rounded-lg bg-[#1868db] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#145cb3]"
          onclick={openCreate}
        >
          일반관리자 추가
        </button>
      </div>
      {#if loadError}
        <p class="px-4 py-8 text-center text-sm text-red-600">조직유저 목록을 불러오지 못했습니다.</p>
      {:else}
        <OrganizationUserList members={adminMembers} {deptName} onselect={openDetail} />
      {/if}
    {:else}
      <!-- 단계적 삭제 2단계: 소프트삭제된 일반관리자. 완전삭제 시 이메일 슬롯 회수 -->
      <div class="border-b border-gray-200 px-4 py-3">
        <p class="text-xs text-gray-500">
          삭제(탈퇴) 처리된 일반관리자입니다. 완전삭제하면 복구할 수 없으며 같은 이메일을 다시 사용할 수 있습니다.
        </p>
      </div>
      <WithdrawnUserList members={withdrawnMembers} />
    {/if}
  </section>
</div>
