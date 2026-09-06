<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import {
    organizationStore as org,
    COMPANY_ID,
  } from '$lib/shared/lib/stores/organizationStore/organizationStore.svelte';
  import { userStore as users } from '$lib/shared/lib/stores/userStore/userStore.svelte';
  import { permissionStore as permissions } from '$lib/shared/lib/stores/permissionStore/permissionStore.svelte';
  import { aiToolDistributionStore as aiTools } from '$lib/shared/lib/stores/aiToolDistributionStore/aiToolDistributionStore.svelte';
  import { positionStore as positions } from '$lib/shared/lib/stores/positionStore/positionStore.svelte';
  import { subscribePopout } from '$lib/shared/lib/popout/popoutChannel';
  import OrgTree from './components/OrgTree.svelte';
  import OrgDetailPanel from './components/OrgDetailPanel.svelte';
  import MemberInfoPanel from './components/MemberInfoPanel.svelte';
  import type { Department } from '$lib/features/departments/types';
  import type { MemberSummary } from '$lib/features/members/types';
  import type { PermissionGrantMatrix } from '$lib/features/permissions/types';
  import type { AiToolDistributionMatrix } from '$lib/features/ai-tool-distribution/types';

  // 조직 관리(슈퍼관리자 전용): 조직도(부서 트리) + 선택 상세. 실데이터 연동
  // 부서 구조(추가/이름변경/이동/삭제)는 즉시 저장되지만, 유저의 부서 배치는 스테이징했다가
  // 조직도 하단의 저장 버튼으로 한 번에 저장한다(userStore). 사용자 관리/팝아웃의 멤버 변경 알림을 받아 새로고침한다.
  interface Props {
    companyName?: string | null;
    departments?: Department[];
    members?: MemberSummary[];
    grantMatrix?: PermissionGrantMatrix;
    aiToolDistribution?: AiToolDistributionMatrix;
    // 현재 관리자가 루트 권한자(ROOT/대표)인지: 시스템관리 부여 게이팅
    hasRootAuthority?: boolean;
    // 현재 관리자가 ROOT(개발관리자) 역할인지: 대표 임명 게이팅(대표는 임명 불가)
    isRootRole?: boolean;
    loadError?: boolean;
  }
  let {
    companyName = null,
    departments = [],
    members = [],
    grantMatrix = { departments: [], members: [] },
    aiToolDistribution = { tools: [], departmentGrants: [], memberGrants: [] },
    hasRootAuthority = false,
    isRootRole = false,
    loadError = false,
  }: Props = $props();

  // invalidate 후 load 가 재실행 → props 가 바뀌며 재-hydrate(서버 상태 반영). 뷰 상태(선택/펼침)는 유지
  $effect(() => {
    org.hydrate(companyName, departments);
  });
  $effect(() => {
    users.hydrate(members);
  });
  $effect(() => {
    permissions.hydrate(grantMatrix);
  });
  $effect(() => {
    aiTools.hydrate(aiToolDistribution);
  });
  $effect(() => {
    positions.hydrate(members);
  });

  // 선택이 가리키는 멤버가 (재)hydrate 후 사라졌으면(삭제 등) 회사 루트로 선택을 되돌린다.
  //   되돌리지 않으면 '유저를 찾을 수 없습니다' 패널이 유령처럼 남는다.
  $effect(() => {
    if (org.selectedKind === 'member' && org.selectedMemberId && !users.user(org.selectedMemberId)) {
      org.select(COMPANY_ID);
    }
  });

  // 사용자 관리/팝아웃에서 멤버가 추가, 변경, 삭제되면 이 화면도 새로고침(조직 트리에 반영)
  onMount(() =>
    subscribePopout((msg) => {
      if (msg.type === 'member:changed') invalidateAll();
    }),
  );

  // 권한, AI도구, 직책 부여 스테이징 저장: 세 스토어를 함께 flush 한 뒤 한 번만 invalidate(재-hydrate 가 스테이징 비움)
  // 저장하지 않고 다른 화면으로 나가면 스테이징은 버려져 원래대로 돌아간다(baseline 유지)
  const grantsDirty = $derived(permissions.dirty || aiTools.dirty || positions.dirty);
  const grantsSaving = $derived(permissions.busy || aiTools.busy || positions.busy);
  const grantsError = $derived(permissions.error || aiTools.error || positions.error);
  const grantsCount = $derived(permissions.pendingCount + aiTools.pendingCount + positions.pendingCount);

  async function saveGrants(): Promise<void> {
    if (grantsSaving) return;
    const r1 = await permissions.flush();
    const r2 = r1.success ? await aiTools.flush() : r1;
    const r3 = r2.success ? await positions.flush() : r2;
    if (r1.success && r2.success && r3.success) await invalidateAll();
  }
  function discardGrants(): void {
    permissions.discard();
    aiTools.discard();
    positions.discard();
  }
</script>

<div class="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
  <!-- 상위 이동은 서브 앱바 브레드크럼(관리자 › 조직 관리)이 담당: 인페이지 '뒤로' 제거 -->
  <header>
    <h1 class="text-xl font-bold text-gray-900">조직 관리</h1>
    <p class="text-sm text-gray-500">조직을 관리하고, 조직에 유저를 배치합니다.</p>
  </header>

  <div class="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
    {#if loadError}
      <p class="border-b border-gray-200 px-4 py-3 text-center text-sm text-red-600">조직도를 불러오지 못했습니다.</p>
    {/if}
    <!-- landscape(≥1024): 좌측 사이드바 + 우측 상세. portrait(<1024): 위 트리 + 아래 상세 -->
    <div class="flex min-h-0 flex-col lg:h-[34rem] lg:flex-row">
      <OrgTree />
      <!-- 우측: 선택 상세 패널 + 권한, AI도구 부여 저장 바(스테이징 변경이 있을 때만) -->
      <div class="flex min-h-0 flex-1 flex-col">
        <!-- 선택(조직/유저)이 바뀌면 상세 패널을 재생성해 입력을 초기화 -->
        {#key org.selectionKey}
          {#if org.selectedKind === 'member'}
            <MemberInfoPanel {hasRootAuthority} {isRootRole} />
          {:else}
            <OrgDetailPanel {hasRootAuthority} />
          {/if}
        {/key}

        {#if grantsDirty}
          <div class="flex items-center gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3">
            {#if grantsError}
              <span class="mr-auto truncate text-xs text-red-600" title={grantsError}>{grantsError}</span>
            {:else}
              <span class="mr-auto text-sm text-gray-600">
                권한, AI도구, 직책 변경 <strong class="text-gray-900">{grantsCount}</strong>건 (미저장)
              </span>
            {/if}
            <button
              type="button"
              onclick={discardGrants}
              disabled={grantsSaving}
              class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              되돌리기
            </button>
            <button
              type="button"
              onclick={saveGrants}
              disabled={grantsSaving}
              class="rounded-lg bg-[#1868db] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#145cb3] disabled:opacity-60"
            >
              {grantsSaving ? '저장 중…' : '저장'}
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
