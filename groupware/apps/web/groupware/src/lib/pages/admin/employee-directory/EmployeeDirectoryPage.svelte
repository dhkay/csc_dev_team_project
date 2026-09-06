<script lang="ts">
  // 직원조회: 앱바 조직 아이콘 팝아웃의 화면. 실데이터(SSR /user-api/org/directory)
  // 좌측 부서 트리(선택=부서+하위 필터) + 우측 검색/표/페이지네이션. 읽기 전용
  // organization_users 에 직위/직책/전화 컬럼이 없어, 표는 역할, 상태, 최근로그인(실재 필드)으로 구성한다.
  import type { MemberSummary } from '$lib/features/members/types';
  import type { Department } from '$lib/features/departments/types';

  interface Props {
    members?: MemberSummary[];
    departments?: Department[];
    orgName?: string;
    loadError?: boolean;
  }
  let { members = [], departments = [], orgName = '', loadError = false }: Props = $props();

  const PAGE_SIZE = 20;

  // 부서 파생(이름 맵 / 자식 맵)
  const deptName = $derived(new Map(departments.map((d) => [d.id, d.name])));
  const childrenOf = $derived.by(() => {
    const map = new Map<number | null, Department[]>();
    for (const d of departments) {
      const arr = map.get(d.parentId) ?? [];
      arr.push(d);
      map.set(d.parentId, arr);
    }
    return map;
  });

  /** 부서 + 하위 서브트리 id 집합(부서 필터용) */
  function descendantIds(rootId: number): Set<number> {
    const set = new Set<number>();
    const walk = (id: number): void => {
      set.add(id);
      for (const c of childrenOf.get(id) ?? []) walk(c.id);
    };
    walk(rootId);
    return set;
  }

  // 라벨
  function deptLabel(id: number | null): string {
    return id == null ? '미배치' : (deptName.get(id) ?? '미배치');
  }

  // 상태
  let selectedDeptId = $state<number | null>(null); // null = 전체 조직
  let expanded = $state<Set<number>>(new Set());
  let deptQuery = $state('');
  let searchField = $state<'name' | 'dept'>('name');
  let searchQuery = $state('');
  let page = $state(1);

  // 선택 부서 필터 집합(null = 전체)
  const deptFilter = $derived(selectedDeptId === null ? null : descendantIds(selectedDeptId));

  // 검색, 부서 필터 적용된 멤버
  const filtered = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    return members.filter((m) => {
      if (deptFilter && !(m.departmentId != null && deptFilter.has(m.departmentId))) return false;
      if (!q) return true;
      const hay = searchField === 'name' ? m.name : deptLabel(m.departmentId);
      return hay.toLowerCase().includes(q);
    });
  });

  const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const currentPage = $derived(Math.min(page, totalPages));
  const pageItems = $derived(filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

  // 좌측 트리: 부서 검색 시 평탄 매칭, 아니면 트리(null=검색 없음)
  const deptMatches = $derived.by(() => {
    const q = deptQuery.trim().toLowerCase();
    if (!q) return null;
    return departments.filter((d) => d.name.toLowerCase().includes(q));
  });
  const rootDepts = $derived(childrenOf.get(null) ?? []);
  const selectedLabel = $derived(selectedDeptId === null ? orgName || '조직 전체' : deptLabel(selectedDeptId));

  function selectDept(id: number | null): void {
    selectedDeptId = id;
    page = 1;
  }
  function toggle(id: number): void {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded = next;
  }
  function resetPage(): void {
    page = 1;
  }
  function close(): void {
    window.close();
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-white text-gray-800">
  <!-- 헤더: 인쇄 / 제목 / 닫기 -->
  <header class="relative flex h-14 shrink-0 items-center justify-between border-b border-gray-200 px-4 print:hidden">
    <button
      type="button"
      onclick={() => window.print()}
      class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
    >
      검색결과 인쇄
    </button>

    <h1 class="pointer-events-none absolute left-1/2 -translate-x-1/2 text-lg font-bold text-gray-900">
      직원조회
    </h1>

    <button
      type="button"
      onclick={close}
      aria-label="닫기"
      class="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  </header>

  <!-- 인쇄 전용 제목 -->
  <div class="hidden px-4 py-2 text-base font-bold text-gray-900 print:block">
    직원조회: {selectedLabel} (총 {filtered.length}명)
  </div>

  <!-- 본문 -->
  <div class="flex min-h-0 flex-1">
    <!-- 좌: 부서 트리 -->
    <aside class="flex w-72 shrink-0 flex-col border-r border-gray-200 print:hidden">
      <div class="p-3">
        <div class="relative">
          <input
            type="text"
            bind:value={deptQuery}
            placeholder="부서를 검색해주세요."
            aria-label="부서 검색"
            class="w-full rounded-md border border-gray-300 py-2 pl-3 pr-9 text-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
          />
          <svg class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </div>
      </div>

      <nav class="min-h-0 flex-1 overflow-auto px-3 pb-3 text-sm">
        <!-- 루트 조직(전체) -->
        <button
          type="button"
          onclick={() => selectDept(null)}
          class="flex w-full items-center gap-1 py-1.5 text-left font-bold {selectedDeptId === null ? 'text-[#1868db]' : 'text-gray-900'}"
        >
          <svg class="h-4 w-4 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span class="truncate {selectedDeptId === null ? 'underline' : ''}">{orgName || '조직 전체'}</span>
        </button>

        {#if deptMatches}
          <!-- 부서 검색 결과(평탄) -->
          <ul class="pl-5">
            {#each deptMatches as d (d.id)}
              <li>
                <button
                  type="button"
                  onclick={() => selectDept(d.id)}
                  class="block w-full truncate py-1.5 text-left {selectedDeptId === d.id ? 'font-semibold text-[#1868db]' : 'text-gray-700 hover:text-gray-900'}"
                >
                  {d.name}
                </button>
              </li>
            {/each}
            {#if deptMatches.length === 0}
              <li class="py-1.5 text-gray-400">검색 결과 없음</li>
            {/if}
          </ul>
        {:else}
          <ul class="pl-1">
            {#each rootDepts as d (d.id)}
              {@render deptTreeNode(d, 0)}
            {/each}
            {#if rootDepts.length === 0}
              <li class="py-1.5 pl-4 text-gray-400">부서가 없습니다.</li>
            {/if}
          </ul>
        {/if}
      </nav>
    </aside>

    <!-- 우: 검색 + 목록 -->
    <section class="flex min-h-0 flex-1 flex-col">
      <!-- 검색 툴바 -->
      <div class="flex shrink-0 items-center gap-2 p-3 print:hidden">
        <div class="relative">
          <select
            bind:value={searchField}
            onchange={resetPage}
            aria-label="검색 항목"
            class="appearance-none rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
          >
            <option value="name">이름</option>
            <option value="dept">부서</option>
          </select>
          <svg class="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>

        <div class="relative flex-1">
          <input
            type="text"
            bind:value={searchQuery}
            oninput={resetPage}
            placeholder="직원을 검색해주세요."
            aria-label="직원 검색"
            class="w-full rounded-md border border-gray-300 py-2 pl-3 pr-9 text-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
          />
          <svg class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </div>
      </div>

      <!-- 목록 헤더: 부서명/카운트 -->
      <div class="flex shrink-0 items-center justify-between px-4 pb-2 print:hidden">
        <p class="text-sm">
          <span class="font-bold text-gray-900">{selectedLabel}</span>
          <span class="ml-2 text-gray-500">총 {filtered.length}/{members.length}명</span>
        </p>
      </div>

      <!-- 표 -->
      <div class="min-h-0 flex-1 overflow-auto border-t border-gray-200 print:overflow-visible">
        <table class="w-full text-left text-sm">
          <thead class="bg-gray-50 text-xs font-medium text-gray-500">
            <tr>
              <th class="px-4 py-2.5">이름</th>
              <th class="px-4 py-2.5">메일주소</th>
              <th class="px-4 py-2.5">부서</th>
              <th class="px-4 py-2.5">전화번호</th>
              <th class="px-4 py-2.5">사내번호</th>
            </tr>
          </thead>
          {#if loadError}
            <tbody>
              <tr><td colspan="5" class="px-4 py-10 text-center text-gray-400">직원 정보를 불러오지 못했습니다.</td></tr>
            </tbody>
          {:else if filtered.length === 0}
            <tbody>
              <tr><td colspan="5" class="px-4 py-10 text-center text-gray-400">표시할 직원이 없습니다.</td></tr>
            </tbody>
          {:else}
            <!-- 화면: 현재 페이지만 -->
            <tbody class="print:hidden">
              {#each pageItems as m (m.id)}
                <tr class="border-b border-gray-100 hover:bg-gray-50">
                  <td class="px-4 py-2.5 text-gray-800">{m.name}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 text-gray-600">{m.email}</td>
                  <td class="px-4 py-2.5 text-gray-600">{deptLabel(m.departmentId)}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 text-gray-600">{m.phone || ''}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 text-gray-600">{m.extension || ''}</td>
                </tr>
              {/each}
            </tbody>
            <!-- 인쇄: 검색 결과 전체 -->
            <tbody class="hidden print:table-row-group">
              {#each filtered as m (m.id)}
                <tr class="border-b border-gray-100">
                  <td class="px-4 py-2.5 text-gray-800">{m.name}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 text-gray-600">{m.email}</td>
                  <td class="px-4 py-2.5 text-gray-600">{deptLabel(m.departmentId)}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 text-gray-600">{m.phone || ''}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 text-gray-600">{m.extension || ''}</td>
                </tr>
              {/each}
            </tbody>
          {/if}
        </table>
      </div>

      <!-- 페이지네이션 -->
      <div class="flex shrink-0 items-center justify-center gap-2 border-t border-gray-200 py-3 text-sm print:hidden">
        <button
          type="button"
          aria-label="이전 페이지"
          disabled={currentPage <= 1}
          onclick={() => (page = Math.max(1, currentPage - 1))}
          class="rounded border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <span class="flex items-center gap-2">
          <span class="rounded border border-gray-300 px-3 py-1 text-gray-700">{currentPage}</span>
          <span class="text-gray-400">/ {totalPages}</span>
        </span>
        <button
          type="button"
          aria-label="다음 페이지"
          disabled={currentPage >= totalPages}
          onclick={() => (page = Math.min(totalPages, currentPage + 1))}
          class="rounded border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </section>
  </div>
</div>

<!-- 부서 트리 노드(재귀) -->
{#snippet deptTreeNode(d: Department, depth: number)}
  {@const kids = childrenOf.get(d.id) ?? []}
  {@const isOpen = expanded.has(d.id)}
  <li>
    <div class="flex items-center gap-1 py-1.5" style="padding-left: {depth * 0.75}rem;">
      {#if kids.length > 0}
        <button
          type="button"
          onclick={() => toggle(d.id)}
          aria-label={isOpen ? '접기' : '펼치기'}
          class="flex h-4 w-4 shrink-0 items-center justify-center text-gray-400 hover:text-gray-600"
        >
          <svg class="h-3.5 w-3.5 transition-transform {isOpen ? 'rotate-90' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      {:else}
        <span class="inline-block w-4 shrink-0"></span>
      {/if}
      <button
        type="button"
        onclick={() => selectDept(d.id)}
        class="min-w-0 flex-1 truncate text-left {selectedDeptId === d.id ? 'font-semibold text-[#1868db]' : 'text-gray-700 hover:text-gray-900'}"
      >
        {d.name}
      </button>
    </div>
    {#if kids.length > 0 && isOpen}
      <ul>
        {#each kids as c (c.id)}
          {@render deptTreeNode(c, depth + 1)}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}
