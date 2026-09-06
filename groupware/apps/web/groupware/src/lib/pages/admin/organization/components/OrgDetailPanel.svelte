<script lang="ts">
  import { organizationStore as org } from '$lib/shared/lib/stores/organizationStore/organizationStore.svelte';
  import { userStore as users } from '$lib/shared/lib/stores/userStore/userStore.svelte';
  import { permissionStore as permissions } from '$lib/shared/lib/stores/permissionStore/permissionStore.svelte';
  import { aiToolDistributionStore as aiTools } from '$lib/shared/lib/stores/aiToolDistributionStore/aiToolDistributionStore.svelte';
  import { PERMISSION_LABELS } from '$lib/shared/lib/stores/permissionStore/permissions';
  import {
    DEPARTMENT_ASSIGNABLE_PERMISSION_KEYS,
    isRootOnlyGrantPermission,
  } from '$lib/features/permissions/types';

  // 선택된 (부서)조직 상세: 이름변경 / 하위조직 추가 / 삭제는 즉시 저장(BFF). 권한, AI도구 부여, 유저 배치는 스테이징(조직도 하단의 저장 버튼으로 일괄 저장)
  // 루트(회사)는 기업명 읽기전용 + 하위조직 추가만. 배치된 유저 목록은 좌측 조직도에서 확인(여기선 검색-배치)
  // 페이지가 {#key org.selectionKey} 로 감싸므로, 선택이 바뀌면 이 컴포넌트가 재생성되어 입력이 자동 초기화된다.
  interface Props {
    // 현재 관리자가 루트 권한자(ROOT/대표)인지: ROOT 전용 권한 부여는 루트 권한자만(그 외 비활성)
    hasRootAuthority?: boolean;
  }
  let { hasRootAuthority = false }: Props = $props();

  const node = $derived(org.selectedNode);
  const isRoot = $derived(node?.parentId === null);

  let renameValue = $state(org.selectedNode?.name ?? '');
  let newSubName = $state('');
  let memberQuery = $state('');

  // 이름 검색 결과(여러 명): 이미 이 조직에 배치된 유저, ROOT 는 제외
  const searchResults = $derived(node ? users.searchAvailableUsers(memberQuery, node.id) : []);

  async function saveRename(): Promise<void> {
    if (node && renameValue.trim()) await org.renameOrg(node.id, renameValue);
  }
  async function addSub(): Promise<void> {
    if (!node || !newSubName.trim()) return;
    await org.addOrg(node.id, newSubName); // 부모 펼침 + 새로고침은 스토어가 수행
    newSubName = '';
  }
  async function removeOrg(): Promise<void> {
    if (!node || node.parentId === null) return;
    await org.deleteOrg(node.id); // 서브트리/소속 멤버 정리 + 부모 선택은 백엔드/스토어가 수행
  }
  function assignUser(userId: string): void {
    if (!node) return;
    users.assignUser(userId, node.id); // 스테이징(조직도 하단의 저장 버튼으로 일괄 저장)
    memberQuery = '';
  }
</script>

<section class="min-h-0 overflow-auto p-5 lg:flex-1">
  {#if node}
    <div class="space-y-6">
      <!-- 이름 변경 -->
      <div>
        <div class="mb-1 flex items-center gap-2">
          <h3 class="text-sm font-semibold text-gray-900">{isRoot ? '기업명' : '조직명'}</h3>
          {#if isRoot}
            <span class="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">최상위</span>
          {/if}
        </div>
        {#if isRoot}
          <!-- 기업명은 플랫폼(control-tower)이 관리 → 읽기전용. 루트는 하위조직 추가만 가능 -->
          <p class="max-w-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {node.name}
          </p>
          <p class="mt-1 text-xs text-gray-400">기업명은 플랫폼에서 관리됩니다. 변경하려면 운영사에 문의하세요.</p>
        {:else}
          <div class="flex gap-2">
            <input
              bind:value={renameValue}
              type="text"
              aria-label="조직명"
              class="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1868db] focus:outline-none"
              onkeydown={(e) => e.key === 'Enter' && saveRename()}
            />
            <button
              type="button"
              onclick={saveRename}
              disabled={!renameValue.trim() || renameValue.trim() === node.name}
              class="shrink-0 rounded-lg bg-[#1868db] px-4 py-2 text-sm font-medium text-white hover:bg-[#145cb3] disabled:opacity-50"
            >
              이름 변경
            </button>
          </div>
        {/if}
      </div>

      <!-- 하위조직 추가 -->
      <div>
        <h3 class="mb-1 text-sm font-semibold text-gray-900">하위조직 추가</h3>
        <p class="mb-2 text-xs text-gray-500">{node.name} 아래에 새 조직을 추가합니다.</p>
        <div class="flex gap-2">
          <input
            bind:value={newSubName}
            type="text"
            placeholder="하위조직 이름"
            aria-label="하위조직 이름"
            class="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1868db] focus:outline-none"
            onkeydown={(e) => e.key === 'Enter' && addSub()}
          />
          <button
            type="button"
            onclick={addSub}
            disabled={!newSubName.trim()}
            class="shrink-0 rounded-lg border border-[#1868db] px-4 py-2 text-sm font-medium text-[#1868db] hover:bg-[#1868db]/5 disabled:opacity-50"
          >
            추가
          </button>
        </div>
      </div>

      <!-- 유저 배치: 루트(기업)에선 숨김(하위조직 추가만). 결과는 검색창에 앵커된 떠 있는 드롭다운 -->
      {#if !isRoot}
        <div>
        <h3 class="mb-1 text-sm font-semibold text-gray-900">유저 배치</h3>
        <p class="mb-2 text-xs text-gray-500">이름으로 검색해 이 조직에 배치합니다. 배치된 유저는 좌측 조직도에서 볼 수 있습니다.</p>

        <div class="relative max-w-sm">
          <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            bind:value={memberQuery}
            type="text"
            placeholder="이름으로 검색하여 배치"
            aria-label="유저 이름 검색"
            class="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-[#1868db] focus:outline-none"
          />

          {#if memberQuery.trim()}
            <!-- 떠 있는 결과 드롭다운: 검색창 기준 absolute(검색창 아래), 높이 반응형(내부 스크롤). 레이아웃을 밀지 않음 -->
            <div class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
              {#if searchResults.length > 0}
                <ul class="max-h-[min(16rem,50vh)] divide-y divide-gray-100 overflow-auto">
                  {#each searchResults as u (u.id)}
                    <li>
                      <button
                        type="button"
                        onclick={() => assignUser(u.id)}
                        class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[#1868db]/5"
                      >
                        <span class="flex min-w-0 items-center gap-2.5">
                          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500" aria-hidden="true">
                            {u.name.charAt(0)}
                          </span>
                          <span class="min-w-0">
                            <span class="block truncate text-sm font-medium text-gray-900">{u.name}</span>
                            <span class="block truncate text-xs text-gray-500">{u.email}</span>
                          </span>
                        </span>
                        <span class="flex shrink-0 items-center gap-2">
                          {#if u.orgId}
                            <span class="truncate text-xs text-gray-400" title="현재 소속">{org.node(u.orgId)?.name}</span>
                          {/if}
                          <span class="inline-flex items-center gap-0.5 text-xs font-medium text-[#1868db]">
                            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                            배치
                          </span>
                        </span>
                      </button>
                    </li>
                  {/each}
                </ul>
              {:else}
                <p class="px-3 py-4 text-center text-xs text-gray-400">검색 결과가 없습니다.</p>
              {/if}
            </div>
          {/if}
        </div>
      </div>
      {/if}

      <!-- 권한 부여 (루트 제외): 이 부서 + 하위 부서 소속 조직원이 상속 -->
      {#if !isRoot}
        <div>
          <h3 class="mb-1 text-sm font-semibold text-gray-900">권한 부여</h3>
          <p class="mb-2 text-xs text-gray-500">
            이 부서와 하위 부서의 구성원이 권한을 상속받습니다.
          </p>
          <div class="flex flex-wrap gap-2">
            <!-- 개인 전용 권한(예: 대표)은 부서 부여 대상에서 제외: 멤버 패널에서만 부여 -->
            <!-- 시스템관리(ROOT 전용)는 루트 권한자(ROOT/대표)가 아니면 비활성: 백엔드도 동일 강제 -->
            {#each DEPARTMENT_ASSIGNABLE_PERMISSION_KEYS as p (p)}
              {@const rootOnly = isRootOnlyGrantPermission(p)}
              {@const locked = rootOnly && !hasRootAuthority}
              <button
                type="button"
                disabled={permissions.busy || locked}
                title={locked ? '시스템관리 권한은 대표 및 개발관리자만 부여할 수 있습니다.' : undefined}
                onclick={() => permissions.toggleDept(node.id, p)}
                class="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 {permissions.hasDept(
                  node.id,
                  p,
                )
                  ? 'border-[#1868db] bg-[#1868db]/10 text-[#1868db]'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'}"
              >
                {PERMISSION_LABELS[p]}{#if locked}<span class="ml-1 text-[11px] opacity-70">,  대표, 개발관리자 전용</span>{/if}
              </button>
            {/each}
          </div>
          {#if permissions.error}
            <p class="mt-1.5 text-xs text-red-600">{permissions.error}</p>
          {/if}
        </div>
      {/if}

      <!-- AI도구 부여(팀) (루트 제외): 조직 보유 도구. 이 부서 + 하위 소속 조직원이 상속 -->
      {#if !isRoot && aiTools.tools.length > 0}
        <div>
          <h3 class="mb-1 text-sm font-semibold text-gray-900">AI도구 부여 (팀)</h3>
          <p class="mb-2 text-xs text-gray-500">
            이 부서와 하위 부서의 구성원이 AI도구를 상속받습니다.
          </p>
          <div class="flex flex-wrap gap-2">
            {#each aiTools.tools as t (t.key)}
              <button
                type="button"
                disabled={aiTools.busy}
                onclick={() => aiTools.toggleDept(node.id, t.key)}
                class="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 {aiTools.hasDept(
                  node.id,
                  t.key,
                )
                  ? 'border-[#1868db] bg-[#1868db]/10 text-[#1868db]'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'}"
              >
                {t.name}
              </button>
            {/each}
          </div>
          {#if aiTools.error}
            <p class="mt-1.5 text-xs text-red-600">{aiTools.error}</p>
          {/if}
        </div>
      {/if}

      <!-- 삭제 (루트 제외) -->
      {#if !isRoot}
        <div class="border-t border-gray-200 pt-4">
          <button
            type="button"
            onclick={removeOrg}
            class="text-sm font-medium text-red-600 hover:underline"
          >
            이 조직 삭제
          </button>
          <p class="mt-1 text-xs text-gray-400">하위조직과 배치된 유저도 함께 삭제됩니다.</p>
        </div>
      {/if}
    </div>
  {/if}
</section>
