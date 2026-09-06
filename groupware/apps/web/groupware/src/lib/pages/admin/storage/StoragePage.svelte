<script lang="ts">
  // /[orgSlug]/admin/storage: 조직 스토리지(공통 / 조직 / 개인)
  //
  // 화면 상태(영역, 부서, 정렬, 검색, 휴지통)는 쿼리스트링에 둔다. 경로 세그먼트로 두면
  // 서브 앱바 브레드크럼이 그 값을 라벨로 그린다(빌더가 세그먼트를 그대로 쓴다)
  //
  // SSR 이 내려주는 것은 "나는 누구이고 무엇을 볼 수 있는가" 뿐이다. 목록과 사용량은 클라이언트
  // 쿼리로 가져온다. 로드에서 영역까지 읽으면 영역을 바꿀 때마다 레이아웃 전체가 다시 로드된다.
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { createMemberIdentityLookup } from '$lib/features/members/lib/roster';
  import type { MemberRosterEntry } from '$lib/features/members/lib/roster';
  import type { Department } from '$lib/features/departments/types';
  import { areaDescription, areaLabel, isStorageArea } from '$lib/features/storage/lib/area';
  import { DEFAULT_SORT, isStorageSortId } from '$lib/features/storage/lib/sort';
  import { canUpload } from '$lib/features/storage/lib/permissions';
  import {
    STORAGE_MAX_PAGE_SIZE,
    STORAGE_PAGE_STEP
  } from '$lib/features/storage/lib/paging';
  import {
    STORAGE_MAX_UPLOAD_BYTES,
    uploadQueue
  } from '$lib/features/storage/lib/uploadQueue.svelte';
  import { storageService } from '$lib/features/storage/services/storage.service';
  import type {
    StorageActor,
    StorageArea,
    StorageFile,
    StorageScope,
    StorageSortId
  } from '$lib/features/storage/types';
  import StorageNav from './components/StorageNav.svelte';
  import StorageToolbar from './components/StorageToolbar.svelte';
  import StorageItemList from './components/StorageItemList.svelte';
  import StorageEmptyState from './components/StorageEmptyState.svelte';
  import UploadDropZone from './components/UploadDropZone.svelte';
  import UploadProgressPanel from './components/UploadProgressPanel.svelte';

  interface Props {
    actor: StorageActor;
    departments: Department[];
    roster: MemberRosterEntry[];
    loadError?: boolean;
  }
  let { actor, departments, roster, loadError = false }: Props = $props();

  const queryClient = useQueryClient();
  const ownerOf = $derived(createMemberIdentityLookup(roster));

  // 주소에서 화면 상태를 읽는다
  const params = $derived($page.url.searchParams);
  const area = $derived<StorageArea>(
    isStorageArea(params.get('area')) ? (params.get('area') as StorageArea) : 'PERSONAL'
  );
  const departmentId = $derived(Number(params.get('dept')) || null);
  const sort = $derived<StorageSortId>(
    isStorageSortId(params.get('sort')) ? (params.get('sort') as StorageSortId) : DEFAULT_SORT
  );
  const search = $derived(params.get('q') ?? '');
  const trashed = $derived(params.get('trash') === '1');

  // 조직 영역에서 부서를 고르지 않았으면 접근 가능한 첫 부서로 채운다(빈 화면을 보여 주지 않는다)
  const effectiveDepartmentId = $derived(
    area === 'DEPARTMENT'
      ? (departmentId ?? actor.accessibleDepartmentIds[0] ?? null)
      : null
  );
  const scope = $derived<StorageScope>({ area, departmentId: effectiveDepartmentId });
  const departmentName = $derived(
    departments.find((d) => d.id === effectiveDepartmentId)?.name ?? ''
  );

  function navigate(patch: Record<string, string | null>): void {
    const next = new URLSearchParams($page.url.searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    void goto(`?${next.toString()}`, { replaceState: true, keepFocus: true, noScroll: true });
  }

  // 데이터
  //
  // 페이지는 "한 번에 보여 주는 개수" 로 넓힌다. 목록이 서버에서 정렬되므로 페이지를 이어 붙이는
  // 대신 같은 조건으로 더 크게 다시 받는다. 조건이 바뀌면(영역, 정렬, 검색, 휴지통) 처음 크기로
  // 되돌린다. 그러지 않으면 다른 목록을 큰 페이지로 여는 셈이 된다.
  let pageSize = $state(STORAGE_PAGE_STEP);
  $effect(() => {
    // 조건이 바뀌면 되돌린다. 아래 값들을 읽는 것이 이 효과의 의존성이다.
    void [scope.area, scope.departmentId, sort, search, trashed];
    pageSize = STORAGE_PAGE_STEP;
  });
  const atPageCap = $derived(pageSize >= STORAGE_MAX_PAGE_SIZE);

  const listingQuery = createQuery(() =>
    storageService.listingQueryOptions(scope, sort, search, trashed, pageSize)
  );
  const usageQuery = createQuery(() => storageService.usageQueryOptions());

  const listingKey = $derived(
    storageService.keys.listing(scope, sort, search, trashed, pageSize)
  );

  const renameMutation = createMutation(() =>
    storageService.renameFileMutationOptions(queryClient, scope, listingKey)
  );
  const trashMutation = createMutation(() =>
    storageService.trashItemsMutationOptions(queryClient, scope, listingKey)
  );
  const restoreMutation = createMutation(() =>
    storageService.restoreItemsMutationOptions(queryClient, scope, listingKey)
  );
  const purgeMutation = createMutation(() =>
    storageService.purgeItemsMutationOptions(queryClient, scope, listingKey)
  );

  const files = $derived(listingQuery.data?.files ?? []);
  const uploadVerdict = $derived(canUpload(actor, scope));

  // 업로드
  let fileInput = $state<HTMLInputElement | null>(null);
  const jobs = $derived(uploadQueue.jobs);

  onMount(() =>
    // 업로드가 끝나면 그 목적지 목록만 다시 읽는다(다른 영역을 보고 있어도 캐시는 최신이 된다)
    uploadQueue.onCompleted(() => {
      void queryClient.invalidateQueries({ queryKey: storageService.keys.all });
    })
  );

  onMount(() => {
    // 올리는 중에 창을 닫으면 그 업로드는 사라진다. 진행 중일 때만 확인을 건다(평소엔 걸지 않는다)
    const guard = (e: BeforeUnloadEvent) => {
      if (uploadQueue.activeCount > 0) e.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  });

  function addFiles(list: File[]): void {
    if (!uploadVerdict.allowed || list.length === 0) return;
    // 지금 이 영역에 있는 이름을 함께 넘겨 겹치면 비켜 가게 한다.
    uploadQueue.enqueue(
      list,
      scope,
      STORAGE_MAX_UPLOAD_BYTES,
      files.map((f) => f.fileName)
    );
  }

  // 다운로드는 평범한 링크다. 같은 origin 의 BFF 가 인가한 뒤 서명 주소로 302 를 준다.
  //   주소를 미리 받아 두지 않으므로 목록마다 왕복이 하나 줄고, 탭을 오래 열어 둬도 낡지 않는다.
  const downloadHref = $derived((file: StorageFile) =>
    storageService.downloadHref(scope, file.id)
  );
</script>

<!--
  방향은 CSS 브레이크포인트(lg = 1024px)로만 다룬다. 관리자 영역의 다른 화면(조직 관리)과 같은
  관용이고, 서버 렌더가 곧바로 맞는 배치를 그린다.

  좁은 화면: 높이를 고정하지 않고 문서 스크롤에 맡긴다. 창을 여러 겹으로 나눠 각자 스크롤시키면
             실제로 목록이 보이는 높이가 몇 줄로 줄어든다.
  넓은 화면: 셸이 화면 높이를 채우고 목록만 안에서 스크롤한다(좌측 레일이 늘 보인다)
-->
<div
  class="flex flex-col rounded-lg border border-line bg-surface
         lg:h-full lg:min-h-0 lg:flex-row lg:overflow-hidden"
>
  <StorageNav
    {actor}
    {departments}
    {scope}
    {trashed}
    usage={usageQuery.data}
    onSelectArea={(next) =>
      navigate({ area: next, dept: null, trash: null })}
    onSelectDepartment={(id) => navigate({ area: 'DEPARTMENT', dept: String(id), trash: null })}
    onToggleTrash={() => navigate({ trash: trashed ? null : '1' })}
  />

  <section class="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
    <StorageToolbar
      title={trashed ? `휴지통 (${areaLabel(area)})` : areaLabel(area)}
      subtitle={trashed
        ? '지금 보고 있는 영역에서 삭제한 파일입니다. 복원하거나 영구 삭제할 수 있습니다.'
        : area === 'DEPARTMENT'
          ? (departmentName || '부서를 선택해 주세요.')
          : areaDescription(area)}
      upload={uploadVerdict}
      {sort}
      {search}
      {trashed}
      onPickFiles={() => fileInput?.click()}
      onSortChange={(next) => navigate({ sort: next })}
      onSearchChange={(value) => navigate({ q: value || null })}
    />

    <input
      bind:this={fileInput}
      type="file"
      multiple
      class="hidden"
      onchange={(e) => {
        addFiles(Array.from(e.currentTarget.files ?? []));
        e.currentTarget.value = '';
      }}
    />

    <UploadDropZone enabled={uploadVerdict.allowed && !trashed} onFiles={addFiles}>
      <div class="lg:min-h-0 lg:flex-1 lg:overflow-auto">
        {#if loadError}
          <p class="px-4 py-8 text-center text-sm text-danger-fg">
            조직 정보를 불러오지 못했습니다. 새로고침해 주세요.
          </p>
        {:else if listingQuery.isError}
          <p class="px-4 py-8 text-center text-sm text-danger-fg">
            파일 목록을 불러오지 못했습니다.
            <button
              type="button"
              class="ml-2 underline underline-offset-2"
              onclick={() => listingQuery.refetch()}
            >
              다시 시도
            </button>
          </p>
        {:else if area === 'DEPARTMENT' && effectiveDepartmentId === null}
          <p class="px-4 py-8 text-center text-sm text-fg-subtle">
            소속된 부서가 없어 조직 영역을 볼 수 없습니다.
          </p>
        {:else if files.length === 0 && !listingQuery.isPending}
          <StorageEmptyState
            searching={search.length > 0}
            {trashed}
            canUpload={uploadVerdict.allowed}
            uploadReason={uploadVerdict.reason}
          />
        {:else}
          <StorageItemList
            {files}
            {actor}
            {scope}
            {trashed}
            pending={listingQuery.isFetching}
            ownerOf={ownerOf}
            {downloadHref}
            onRename={(file, name) => renameMutation.mutate({ id: file.id, fileName: name })}
            onTrash={(file) => trashMutation.mutate([file.id])}
            onRestore={(file) => restoreMutation.mutate([file.id])}
            onPurge={(file) => purgeMutation.mutate([file.id])}
          />

          <!-- 몇 개 중 몇 개를 보고 있는지 늘 적는다. 이 줄이 없으면 50번째 뒤의 파일이
               있다는 사실 자체가 화면에 나타나지 않는다. -->
          <footer class="flex items-center justify-center gap-3 px-4 py-4">
            <p class="text-xs text-fg-subtle">
              전체 {listingQuery.data?.total ?? files.length}개 중 {files.length}개
            </p>
            {#if listingQuery.data?.hasMore && !atPageCap}
              <button
                type="button"
                class="rounded-md border border-line px-3 py-1.5 text-xs text-fg-subtle transition hover:bg-hover hover:text-fg"
                onclick={() =>
                  (pageSize = Math.min(pageSize + STORAGE_PAGE_STEP, STORAGE_MAX_PAGE_SIZE))}
              >
                더 보기
              </button>
            {:else if listingQuery.data?.hasMore}
              <!-- 한 번에 받는 개수의 상한이다. 남은 파일이 있다는 사실을 감추지 않고,
                   무엇을 하면 찾을 수 있는지 함께 적는다(폴더는 2단계에 들어온다) -->
              <p class="text-xs text-fg-subtle">
                검색이나 정렬로 좁혀 주세요.
              </p>
            {/if}
          </footer>
        {/if}
      </div>
    </UploadDropZone>
  </section>
</div>

<UploadProgressPanel
  {jobs}
  onCancel={(jobId) => uploadQueue.cancel(jobId)}
  onDismiss={() => uploadQueue.dismissFinished()}
/>
