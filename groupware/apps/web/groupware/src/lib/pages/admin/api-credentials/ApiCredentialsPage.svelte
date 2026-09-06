<script lang="ts">
  // /[orgSlug]/admin/api-credentials: 공용 API 등록(루트 권한자 전용). 가드는 +page.server.ts.
  // 조직이 공용으로 쓰는 외부 API 키를 등록/삭제한다. 키는 두 갈래다(카탈로그의 kind)
  //   AI 회사: 모델을 만든 회사가 직접 파는 키. 플랫폼: 여러 회사 모델을 한 API 로 중계하는 플랫폼 키
  // 데이터: TanStack Query(createQuery) → service 옵션 → BFF(/api/api-credentials) → csc-groupware.
  //
  // 목록 + 카드로 나눈 이유: 프로바이더는 계속 늘어난다. 한 줄 탭이면 곧 줄바꿈되고, 회사 키와
  //   플랫폼 키가 한 줄에 섞여 성격 차이가 드러나지 않는다. 목록은 세로로만 길어지고, 길어지면
  //   검색으로 찾는다.
  // 배치는 클래스만 갈리므로 CSS(`lg:` = viewportBreakpoints 의 portrait/landscape 경계 1024px)로
  //   푼다. 마크업이 하나로 남아 서버 렌더가 곧바로 맞는 배치를 그리고, 검색과 선택 동작이 두 모드에서
  //   같은 코드로 돈다(관용은 viewportBreakpoints.ts 의 WIDE_MIN_WIDTH 주석 참고)
  import { page } from '$app/stores';
  import { createQuery } from '@tanstack/svelte-query';
  import { apiCredentialsService } from '$lib/features/api-credentials/services/apiCredentials.service';
  import {
    API_PROVIDER_CATALOG,
    API_PROVIDER_KIND_META,
    findApiProvider,
    hasRequiredCredentials,
    isApiProviderKey,
    type ApiCredentialView,
    type ApiProviderKey
  } from '$lib/features/api-credentials/types';
  import { searchProviderGroups } from '$lib/features/api-credentials/lib/providerSearch';
  import ApiProviderCard from './components/ApiProviderCard.svelte';

  const orgSlug = $derived($page.params.orgSlug);

  const listQuery = createQuery(() => apiCredentialsService.listOptions());

  // provider → 뷰 매핑(등록 상태 조회용)
  const viewByProvider = $derived.by(() => {
    const map = new Map<string, ApiCredentialView>();
    for (const v of listQuery.data ?? []) map.set(v.provider, v);
    return map;
  });

  /**
   * ?provider= 로 특정 프로바이더를 바로 열 수 있다(다른 화면의 안내나 북마크). 모르는 값이면 첫 항목
   *
   * 진입 시 한 번만 읽는다. 쿼리만 바뀌는 이동은 이 컴포넌트를 다시 만들지 않아 반영되지 않지만,
   * 이 화면 안에는 그런 이동을 만드는 링크가 없다(다른 화면에서 오면 새로 마운트된다)
   * 같은 화면 안에서 프로바이더를 가리키는 링크가 생기면 그때 URL 을 따라가는 동기화를 더한다.
   */
  const initialProvider = $page.url.searchParams.get('provider');
  let selected = $state<ApiProviderKey>(
    initialProvider && isApiProviderKey(initialProvider)
      ? initialProvider
      : API_PROVIDER_CATALOG[0].key
  );
  const selectedMeta = $derived(findApiProvider(selected) ?? API_PROVIDER_CATALOG[0]);

  // 검색: 목록을 걸러낸다(조직도와 달리 강조가 아니라 필터다).
  // 트리는 걸러내면 구조를 잃지만 이 목록은 평평해서 잃을 구조가 없고, 여기서 하려는 일은
  //   "찾아서 등록" 이라 찾는 동안 나머지가 보일 이유가 없다. 필터 규칙은 features/lib 가 소유한다.
  let query = $state('');
  const groups = $derived(searchProviderGroups(query));
  const noMatch = $derived(groups.length === 0);

  /** Enter: 첫 일치 항목을 연다. 검색창에서 손을 떼지 않고 등록 폼으로 넘어간다. */
  function onSearchKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter') return;
    const first = groups[0]?.items[0];
    if (first) selected = first.key;
  }

  /** 등록 완료 판정은 카탈로그가 소유한다(필드가 둘인 플랫폼은 둘 다 차야 한다) */
  function isConfigured(key: ApiProviderKey): boolean {
    const meta = findApiProvider(key);
    const view = viewByProvider.get(key);
    return !!meta && !!view && hasRequiredCredentials(meta, view.configuredFields);
  }
</script>

<div class="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
  <!-- 뒤로: 관리자 홈(타일)으로 -->
  <a
    href={`/${orgSlug}/admin`}
    class="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-800"
  >
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
    뒤로
  </a>

  <header>
    <h1 class="text-xl font-bold text-gray-900">API 등록</h1>
    <p class="text-sm text-gray-500">
      조직이 공용으로 사용하는 외부 API 키를 등록합니다. 등록된 키는 암호화되어 저장되며, 값은 다시
      표시되지 않습니다.
    </p>
  </header>

  {#if listQuery.isError}
    <p
      class="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-3 py-8 text-center text-sm text-red-600"
      role="alert"
    >
      자격증명을 불러오지 못했습니다.
      <button
        type="button"
        onclick={() => listQuery.refetch()}
        class="rounded-md px-2 py-0.5 text-gray-800 underline decoration-gray-300 underline-offset-2 transition hover:decoration-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/40"
      >
        다시 시도
      </button>
    </p>
  {:else}
    <!-- landscape(≥1024): 좌측 목록 + 우측 카드. portrait(<1024): 위 목록 + 아래 카드 -->
    <div class="grid gap-4 lg:grid-cols-[15rem_1fr] lg:items-start">
      <div class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
        <div class="border-b border-gray-200 p-2">
          <div class="relative">
            <svg class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              bind:value={query}
              onkeydown={onSearchKeydown}
              type="search"
              placeholder="API 검색"
              aria-label="API 프로바이더 검색"
              class="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-7 pr-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-[#1868db] focus:outline-none focus:ring-2 focus:ring-[#1868db]/15"
            />
          </div>
        </div>

        <!-- portrait 에서는 목록이 길면 카드가 화면 밖으로 밀리므로 높이를 잡고 안에서 스크롤한다.
             landscape 도 프로바이더가 늘면 같은 문제가 생겨 상한만 다르게 둔다. -->
        <div
          class="max-h-64 min-h-0 flex-1 overflow-auto p-2 lg:max-h-[26rem]"
          role="tablist"
          aria-orientation="vertical"
          aria-label="API 프로바이더"
        >
          {#if noMatch}
            <p class="px-2 py-4 text-center text-[11px] text-gray-400">일치하는 항목이 없습니다.</p>
          {/if}
          {#each groups as group (group.kind)}
            <div class="flex flex-col gap-0.5 pb-2">
              <span class="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                {API_PROVIDER_KIND_META[group.kind].label}
              </span>
              {#each group.items as meta (meta.key)}
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected === meta.key}
                  onclick={() => (selected = meta.key)}
                  class="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/40 {selected ===
                  meta.key
                    ? 'bg-white font-medium text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'}"
                >
                  <span class="truncate">{meta.label}</span>
                  {#if isConfigured(meta.key)}
                    <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title="등록됨" aria-label="등록됨"></span>
                  {/if}
                </button>
              {/each}
            </div>
          {/each}
        </div>
      </div>

      <!-- {#key}: 프로바이더를 바꾸면 카드가 다시 만들어져 입력 중이던 값이 구조적으로 버려진다.
           손으로 비우면 그 한 줄을 빠뜨렸을 때 방금 친 키가 다른 프로바이더 폼에 남는다. -->
      {#key selectedMeta.key}
        <ApiProviderCard
          meta={selectedMeta}
          view={viewByProvider.get(selectedMeta.key)}
          loading={listQuery.isPending}
        />
      {/key}
    </div>
  {/if}
</div>
