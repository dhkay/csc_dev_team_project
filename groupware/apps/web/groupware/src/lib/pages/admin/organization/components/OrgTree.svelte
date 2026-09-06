<script lang="ts">
  import { tick } from 'svelte';
  import { organizationStore as org } from '$lib/shared/lib/stores/organizationStore/organizationStore.svelte';
  import type { OrgNode } from '$lib/shared/lib/stores/organizationStore/organizationStore.svelte';
  import { userStore as users } from '$lib/shared/lib/stores/userStore/userStore.svelte';
  import type { OrgUser } from '$lib/shared/lib/stores/userStore/userStore.svelte';
  import { permissionStore as permissions } from '$lib/shared/lib/stores/permissionStore/permissionStore.svelte';
  import { aiToolDistributionStore as aiTools } from '$lib/shared/lib/stores/aiToolDistributionStore/aiToolDistributionStore.svelte';
  import { positionStore as positions } from '$lib/shared/lib/stores/positionStore/positionStore.svelte';
  import { PERMISSION_LABELS } from '$lib/shared/lib/stores/permissionStore/permissions';
  import { AI_TOOL_LABELS, type AiToolKey } from '$lib/features/ai-tool-distribution/types';
  import { ORG_POSITION_LABELS } from '$lib/features/positions/types';
  import type { Permission } from '$lib/shared/lib/stores/permissionStore/permissions';

  // 조직도 사이드바: 재귀 트리 + 조직/조직원 드래그앤드롭 + 이름 검색 + 미배치 인원 영역
  // 선택/펼침은 store 의 공유 뷰 상태(org.selectionKey / org.isExpanded)를 사용한다.
  // 유저 배치(드래그/드롭)는 즉시 저장하지 않고 스테이징되며, 조직도 하단의 저장 버튼으로 일괄 저장한다.
  // (부서 추가/이름변경/이동/삭제는 즉시 저장.)

  // 검색: 일치 항목을 강조(ring)하고 첫 매치를 포커싱(조상 펼침 + 선택 + 스크롤)한다.
  //    트리는 필터하지 않는다. 전체 트리를 유지하면서 찾은 항목만 강조하고 선택한다.
  let query = $state('');
  const q = $derived(query.trim().toLowerCase());

  function orgMatches(node: OrgNode): boolean {
    return q !== '' && node.name.toLowerCase().includes(q);
  }
  function memberMatches(m: OrgUser): boolean {
    return q !== '' && (m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  }

  type Hit = { kind: 'org' | 'member'; id: string; orgId: string };
  // 슈퍼관리자(ROOT)는 조직도에 표시하지 않는다. 소유자라 자명하고 부서 배치 대상도 아니다.
  const notRoot = (m: OrgUser): boolean => m.role !== 'ROOT';
  // DFS 로 첫 매치(조직명 → 그 조직의 유저 → 하위조직 순)를 찾는다.
  function firstMatch(node: OrgNode): Hit | null {
    if (orgMatches(node)) return { kind: 'org', id: node.id, orgId: node.id };
    const m = users.membersOf(node.id).filter(notRoot).find(memberMatches);
    if (m) return { kind: 'member', id: m.id, orgId: node.id };
    for (const child of org.childrenOf(node.id)) {
      const hit = firstMatch(child);
      if (hit) return hit;
    }
    return null;
  }

  // 미배치 인원 (루트와 같은 레이어): 드롭=배치 해제, 드래그=조직으로 배치
  const unassigned = $derived(users.unassignedMembers().filter(notRoot));
  let unassignedOpen = $state(true);
  let dragOverUnassigned = $state(false);

  // 검색 결과 없음. 조직 트리 + 미배치 인원 모두 일치 없을 때
  const noMatch = $derived(q !== '' && !firstMatch(org.root()) && !unassigned.some(memberMatches));

  // 검색어가 바뀌면 첫 매치를 포커싱: 조상 펼침 + 선택 + 행 스크롤. (필터링은 하지 않는다)
  let focusedFor = '';
  $effect(() => {
    const cur = q;
    if (cur === '' || cur === focusedFor) {
      if (cur === '') focusedFor = '';
      return;
    }
    focusedFor = cur;
    const hit = firstMatch(org.root());
    if (hit) {
      for (const id of org.ancestorIds(hit.orgId)) org.expand(id);
      if (hit.kind === 'org') org.select(hit.id);
      else org.selectMember(hit.id);
      const rowId = hit.kind === 'org' ? `orgrow-${hit.id}` : `memberrow-${hit.id}`;
      void tick().then(() => document.getElementById(rowId)?.scrollIntoView({ block: 'nearest' }));
      return;
    }
    // 조직 트리에 없으면 미배치 인원에서 찾는다.
    const u = users.unassignedMembers().filter(notRoot).find(memberMatches);
    if (u) {
      unassignedOpen = true;
      org.selectMember(u.id);
      void tick().then(() => document.getElementById(`memberrow-${u.id}`)?.scrollIntoView({ block: 'nearest' }));
    }
  });

  // 드래그앤드롭: 조직원/조직을 다른 조직으로 이동 (트리 로컬 상태)
  let draggingMemberId = $state<string | null>(null);
  let draggingOrgId = $state<string | null>(null);
  let dragOverOrgId = $state<string | null>(null);

  function onMemberDragStart(e: DragEvent, memberId: string): void {
    draggingMemberId = memberId;
    draggingOrgId = null;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', memberId);
    }
  }
  function onOrgDragStart(e: DragEvent, orgId: string): void {
    draggingOrgId = orgId;
    draggingMemberId = null;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', orgId);
    }
  }
  function onDragEnd(): void {
    draggingMemberId = null;
    draggingOrgId = null;
    dragOverOrgId = null;
    dragOverUnassigned = false;
  }

  /** 현재 드래그 중인 항목을 이 조직 노드에 드롭할 수 있는가 */
  function isValidDropTarget(orgId: string): boolean {
    if (draggingMemberId) return true; // 유저는 어떤 조직으로도 이동 가능
    if (draggingOrgId) return org.canDropOrg(draggingOrgId, orgId); // 조직은 자기/자손 제외
    return false;
  }

  function onOrgDragOver(e: DragEvent, orgId: string): void {
    if (!isValidDropTarget(orgId)) return; // 무효 대상이면 drop 비허용(하이라이트 X)
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (dragOverOrgId !== orgId) dragOverOrgId = orgId;
  }
  function onOrgDragLeave(orgId: string): void {
    if (dragOverOrgId === orgId) dragOverOrgId = null;
  }
  function onOrgDrop(e: DragEvent, orgId: string): void {
    e.preventDefault();
    if (draggingMemberId) users.assignUser(draggingMemberId, orgId);
    else if (draggingOrgId) org.moveOrg(draggingOrgId, orgId);
    org.expand(orgId); // 이동 결과가 보이도록 대상 조직 펼침
    onDragEnd();
  }

  // 미배치 인원 영역은 멤버만 받는다(조직 X): 드롭하면 배치 해제
  function onUnassignedDragOver(e: DragEvent): void {
    if (!draggingMemberId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dragOverUnassigned = true;
  }
  function onUnassignedDragLeave(): void {
    dragOverUnassigned = false;
  }
  function onUnassignedDrop(e: DragEvent): void {
    e.preventDefault();
    if (draggingMemberId) users.unassignUser(draggingMemberId);
    dragOverUnassigned = false;
    onDragEnd();
  }

  // 권한 라벨이 행 폭을 넘치면 라벨을 가리고 '…' 표시(이름은 가리지 않음)
  function clipIndicator(el: HTMLElement) {
    const update = () => el.classList.toggle('is-clipped', el.scrollWidth > el.clientWidth + 1);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return { destroy: () => ro.disconnect() };
  }
</script>

<aside class="flex flex-col border-b border-gray-200 bg-white lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r lg:bg-gray-50/70">
  <div class="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
    <h2 class="shrink-0 text-sm font-semibold text-gray-900">조직도</h2>
    <div class="relative ml-auto min-w-0 max-w-[12rem] flex-1">
      <svg class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        bind:value={query}
        type="text"
        placeholder="이름 검색"
        aria-label="조직, 유저 이름 검색"
        class="w-full rounded-md border border-gray-300 py-1 pl-7 pr-2 text-xs placeholder:text-gray-400 focus:border-[#1868db] focus:outline-none"
      />
    </div>
  </div>
  <nav class="max-h-72 min-h-0 overflow-auto p-2 text-sm lg:max-h-none lg:flex-1">
    {#if noMatch}
      <p class="px-2 pb-1 text-[11px] text-gray-400">일치하는 항목이 없습니다.</p>
    {/if}
    {@render treeNode(org.root(), 0)}

    <!-- 미배치 인원: 루트와 같은 레이어. 드롭하면 배치 해제, 드래그해서 조직에 배치 -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="mt-1 flex items-center gap-1 rounded-md py-1 pr-1.5 transition-colors {dragOverUnassigned
        ? 'bg-amber-100 ring-1 ring-inset ring-amber-400'
        : 'hover:bg-gray-200/50'}"
      style="padding-left: 0.25rem;"
      ondragover={onUnassignedDragOver}
      ondragleave={onUnassignedDragLeave}
      ondrop={onUnassignedDrop}
    >
      {#if unassigned.length > 0}
        <button
          type="button"
          onclick={() => (unassignedOpen = !unassignedOpen)}
          aria-label={unassignedOpen ? '접기' : '펼치기'}
          class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-200/60"
        >
          <svg class="h-3.5 w-3.5 transition-transform {unassignedOpen ? 'rotate-90' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      {:else}
        <span class="inline-block w-5 shrink-0"></span>
      {/if}

      <!-- 미배치 아이콘(사람 그룹) -->
      <svg class="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
        <circle cx="9" cy="8" r="3" />
        <path d="M22 19v-1a4 4 0 0 0-3-3.87" />
        <path d="M16 5.13a4 4 0 0 1 0 7.75" />
      </svg>

      <span class="min-w-0 flex-1 truncate py-0.5 text-gray-700">미배치 인원</span>
      <span class="shrink-0 text-[11px] text-gray-400" title="미배치 인원 수">{unassigned.length}</span>
    </div>

    {#if unassignedOpen}
      {#if unassigned.length > 0}
        {#each unassigned as m (m.id)}
          {@render memberRow(m, 1)}
        {/each}
      {:else}
        <p class="py-1.5 text-[11px] text-gray-400" style="padding-left: 1rem;">
          여기로 끌어다 놓으면 배치가 해제됩니다.
        </p>
      {/if}
    {/if}
  </nav>

  <!-- 유저 배치 저장: 드래그로 옮긴 배치는 스테이징되고, 여기서 저장/되돌리기 한다(변경 있을 때만) -->
  {#if users.dirty}
    <div class="flex items-center gap-2 border-t border-gray-200 bg-white px-3 py-2">
      {#if users.error}
        <span class="mr-auto truncate text-xs text-red-600" title={users.error}>{users.error}</span>
      {:else}
        <span class="mr-auto text-xs text-gray-500">배치 변경 {users.pendingCount}건</span>
      {/if}
      <button
        type="button"
        onclick={() => users.discard()}
        disabled={users.saving}
        class="shrink-0 rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
      >
        되돌리기
      </button>
      <button
        type="button"
        onclick={() => users.save()}
        disabled={users.saving}
        class="shrink-0 rounded-md bg-[#1868db] px-3 py-1 text-xs font-medium text-white hover:bg-[#145cb3] disabled:opacity-60"
      >
        {users.saving ? '저장 중…' : '저장'}
      </button>
    </div>
  {/if}
</aside>

<!-- 부여 라벨 칩(권한=파랑, AI도구=보라): 조직 노드/멤버 행 공용. 직접 grant 만(상속은 상위 노드에 표시)
     폭이 좁으면 이름이 우선이고 칩 영역이 먼저 줄며, 넘치면 칩이 잘리고 … 가 노출된다. -->
{#snippet grantChips(perms: Permission[], toolKeys: AiToolKey[])}
  {#if perms.length > 0 || toolKeys.length > 0}
    <div class="flex min-w-0 items-center" style="flex-shrink: 9999;">
      <div class="perm-labels flex min-w-0 flex-1 items-center gap-1 overflow-hidden" use:clipIndicator>
        {#each perms as p (p)}
          <span class="shrink-0 rounded bg-[#1868db]/10 px-1 py-0.5 text-[10px] font-medium text-[#1868db]">
            {PERMISSION_LABELS[p]}
          </span>
        {/each}
        {#each toolKeys as k (k)}
          <span class="shrink-0 rounded bg-violet-100 px-1 py-0.5 text-[10px] font-medium text-violet-700">
            {AI_TOOL_LABELS[k]}
          </span>
        {/each}
      </div>
      <span class="perm-more shrink-0 pl-0.5 text-[11px] text-gray-400" aria-hidden="true">…</span>
    </div>
  {/if}
{/snippet}

<!-- 조직원(리프) 행: 조직 멤버 / 미배치 인원 공용. 클릭=유저 정보 선택, 드래그=배치/해제 -->
{#snippet memberRow(m: OrgUser, depth: number)}
  {@const memberSelected = org.selectedMemberId === m.id}
  {@const memberMatched = memberMatches(m)}
  {@const canDrag = m.role === 'ADMIN'}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    id="memberrow-{m.id}"
    class="flex items-center gap-1.5 rounded-md py-1 pr-1.5 {canDrag
      ? 'cursor-grab active:cursor-grabbing'
      : ''} {draggingMemberId === m.id
      ? 'opacity-50'
      : memberSelected
        ? 'bg-[#1868db]/10'
        : 'hover:bg-gray-200/40'} {memberMatched && !memberSelected ? 'ring-1 ring-inset ring-amber-400' : ''}"
    style="padding-left: {depth * 0.75 + 0.25}rem;"
    draggable={canDrag}
    ondragstart={(e) => canDrag && onMemberDragStart(e, m.id)}
    ondragend={onDragEnd}
    title={canDrag ? '드래그하여 조직에 배치하거나 미배치로 이동' : '슈퍼관리자는 이동할 수 없습니다'}
  >
    <!-- 드래그 핸들(조직 행의 토글 자리와 정렬): ADMIN 만(슈퍼관리자는 이동 불가) -->
    <span class="flex w-5 shrink-0 items-center justify-center text-gray-300" aria-hidden="true">
      {#if canDrag}
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" />
          <circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" />
          <circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
        </svg>
      {/if}
    </span>
    <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500" aria-hidden="true">
      {m.name.charAt(0)}
    </span>
    <!-- 트리 행이 좁아 이메일은 툴팁으로: 이유는 roster.ts 참고(상세 패널엔 이메일이 항상 보인다) -->
    <button
      type="button"
      onclick={() => org.selectMember(m.id)}
      title={m.email}
      class="min-w-0 flex-1 truncate text-left text-[13px] {memberSelected ? 'font-semibold text-[#1868db]' : 'text-gray-600'}"
    >
      {m.name}
    </button>
    <!-- 직책 배지(대표/팀장): 권한/AI도구와 분리된 차원. 스테이징 반영(positionStore) -->
    {#if positions.positionOf(m.id)}
      <span class="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
        {ORG_POSITION_LABELS[positions.positionOf(m.id)!]}
      </span>
    {/if}
    <!-- 개인 직접 부여(권한, AI도구) 라벨: 상속분은 소속 부서 노드에 표시되므로 여기선 직접분만 -->
    {@render grantChips(permissions.memberPermissions(m.id), aiTools.memberAiTools(m.id))}
    <!-- 슈퍼관리자(ROOT)는 별도 뱃지 미표시: 소유자라 자명(이동 불가 자체는 드래그 핸들 부재로 드러남) -->
  </div>
{/snippet}

<!-- 조직 트리 노드(재귀) -->
{#snippet treeNode(node: OrgNode, depth: number)}
  {@const childOrgs = org.childrenOf(node.id)}
  {@const nodeMembers = users.membersOf(node.id).filter(notRoot)}
  {@const expandable = childOrgs.length > 0 || nodeMembers.length > 0}
  {@const isRootNode = node.parentId === null}
  {@const selected = org.selectedKind === 'org' && org.selectedId === node.id}
  {@const matched = orgMatches(node)}
  {@const open = org.isExpanded(node.id)}
  {@const orgPerms = permissions.orgPermissions(node.id)}
  <div>
    <!-- 조직 노드 (드래그=다른 조직 하위로 이동 / 드롭=대상 조직). 루트는 이동 불가 -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      id="orgrow-{node.id}"
      class="flex items-center gap-1 rounded-md py-1 pr-1.5 transition-colors {!isRootNode
        ? 'cursor-grab active:cursor-grabbing'
        : ''} {draggingOrgId === node.id
        ? 'opacity-50'
        : dragOverOrgId === node.id
          ? 'bg-[#1868db]/15 ring-1 ring-inset ring-[#1868db]/50'
          : selected
            ? 'bg-[#1868db]/10'
            : 'hover:bg-gray-200/50'} {matched && !selected && dragOverOrgId !== node.id
        ? 'ring-1 ring-inset ring-amber-400'
        : ''}"
      style="padding-left: {depth * 0.75 + 0.25}rem;"
      draggable={!isRootNode}
      title={isRootNode ? undefined : '드래그하여 다른 조직의 하위로 이동'}
      ondragstart={(e) => onOrgDragStart(e, node.id)}
      ondragend={onDragEnd}
      ondragover={(e) => onOrgDragOver(e, node.id)}
      ondragleave={() => onOrgDragLeave(node.id)}
      ondrop={(e) => onOrgDrop(e, node.id)}
    >
      {#if expandable}
        <button
          type="button"
          onclick={() => org.toggle(node.id)}
          aria-label={open ? '접기' : '펼치기'}
          class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-200/60"
        >
          <svg class="h-3.5 w-3.5 transition-transform {open ? 'rotate-90' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      {:else}
        <span class="inline-block w-5 shrink-0"></span>
      {/if}

      <!-- 노드 아이콘: 루트(기업)=건물 / 하위조직=폴더 -->
      <svg class="h-4 w-4 shrink-0 {selected ? 'text-[#1868db]' : 'text-gray-400'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        {#if isRootNode}
          <path d="M3 21h18" />
          <path d="M6 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16" />
          <path d="M15 21V9h3a1 1 0 0 1 1 1v11" />
          <path d="M9 7h2M9 11h2M9 15h2" />
        {:else}
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
        {/if}
      </svg>

      <button
        type="button"
        onclick={() => org.select(node.id)}
        class="min-w-0 flex-1 truncate py-0.5 text-left {selected ? 'font-semibold text-[#1868db]' : 'text-gray-700'}"
      >
        {node.name}
      </button>

      <!-- 부서에 부여된 권한, AI도구 라벨(직접 grant). 이 부서+하위 소속 멤버가 상속받는다. -->
      {@render grantChips(orgPerms, aiTools.deptAiTools(node.id))}

      {#if nodeMembers.length > 0}
        <span class="shrink-0 text-[11px] text-gray-400" title="배치 인원">{nodeMembers.length}</span>
      {/if}
    </div>

    {#if expandable && open}
      <!-- 하위 조직(재귀) -->
      {#each childOrgs as child (child.id)}
        {@render treeNode(child, depth + 1)}
      {/each}
      <!-- 조직원(리프) -->
      {#each nodeMembers as m (m.id)}
        {@render memberRow(m, depth + 1)}
      {/each}
    {/if}
  </div>
{/snippet}

<style>
  /* 권한 라벨 넘침 처리: 폭이 좁으면 이름 대신 라벨 영역이 먼저 줄고,
     넘치면 라벨이 우측으로 페이드되며 잘리고 '…' 가 노출된다(이름은 유지) */
  .perm-more {
    display: none;
  }
  .perm-labels:global(.is-clipped) {
    -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 0.75rem), transparent);
    mask-image: linear-gradient(to right, #000 calc(100% - 0.75rem), transparent);
  }
  .perm-labels:global(.is-clipped) + .perm-more {
    display: inline;
  }
</style>
