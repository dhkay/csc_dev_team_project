<script lang="ts">
  // 보관함(조직 공용): 조직이 완성본을 함께 모아 두는 곳. 셸(nav)은 상위 레이아웃
  //   워크스페이스와 달리 채널로 나뉘지 않는다(채널이 개인 소유라 채널로 묶으면 공용이 성립하지 않는다)
  //   그래서 카드에 만든 사람 배지가 붙는다: 남의 것이 섞이므로 누구 것인지 말해야 한다.
  //   동작별 경계가 다르다. 꺼내기는 누구 것이든 가능하고 꺼낸 사람 워크스페이스로 들어온다.
  //   삭제는 만든 사람 또는 관리급(대표/팀장)만(완성본을 잃는 동작이라 열람처럼 전원에게 열지 않는다)
  //   화면의 제한은 편의고 경계는 서버다.
  //   보관물은 완성본뿐이라(서버가 렌더 중 보관을 막는다) 폴링하지 않는다.
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import VideoProjectGrid from '$lib/pages/tools/marketing-video/shared/VideoProjectGrid.svelte';
  import ModeDropdown, {
    type WorkspaceMode,
  } from '$lib/pages/tools/marketing-video/shared/ModeDropdown.svelte';
  import SelectionActionBar from '$lib/pages/tools/marketing-video/shared/SelectionActionBar.svelte';
  import DownloadSelectedButton from '$lib/pages/tools/marketing-video/shared/DownloadSelectedButton.svelte';
  import { marketingChannelsService as svc } from '$lib/features/marketing-channels/services/marketingChannels.service';
  import ArchiveFilterBar from '$lib/pages/tools/marketing-video/archive/ArchiveFilterBar.svelte';
  import { versionProfile } from '$lib/pages/tools/marketing-video/versionProfile';
  import { createBulkDownload } from '$lib/shared/lib/utils/bulkDownload.svelte';
  import { viewportModeStore } from '$lib/shared/lib/stores/viewport/viewportModeStore/viewportModeStore.svelte';
  import {
    DEFAULT_ARCHIVE_FILTER,
    filterArchivedVideos,
    isArchiveFilterActive,
    resetArchiveFilter,
    type ArchiveFilterCriteria,
  } from '$lib/features/marketing-channels/lib/archiveFilter';
  import type { ArchivedVideo } from '$lib/features/marketing-channels/types';
  import { createMemberIdentityLookup } from '$lib/features/members/lib/roster';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const currentChannelId = $derived(data.currentChannelId);
  // 보관함은 (조직 × 버전)으로만 갈린다: 작업자도 채널도 조건이 아니다. 버전은 담기는 산출물까지
  //   정한다(versionProfile.archiveSource): 원천과 최종을 나누지 않는 버전에서는 그 하나뿐인
  //   영상이 곧 배포본이라 그것이 보관된다. 그 판정은 BFF 가 하므로 이 화면은 버전만 나른다.
  const version = $derived(data.version);
  /**
   * 카드의 그림이 사람이 만든 썸네일인가(자동으로 뽑힌 첫 씬 이미지가 아니라)
   *
   * 결과 확인 화면이 있는 버전이 그 그림을 만드는 유일한 자리이고, 그 버전은 씬 이미지를 만들지
   * 않아 카드의 그림이 곧 그 썸네일이다. 워크스페이스와 같은 판정을 쓴다.
   */
  const humanThumbnails = $derived(versionProfile(version).hasGenerationProgress);
  // 보관물이 어느 구역에서 오는지: 빈 안내가 그 버전에 실제로 있는 길을 가리키게 한다.
  const sourceLabel = $derived.by(() => {
    const profile = versionProfile(version);
    if (!profile.hasStageTabs) return '워크스페이스';
    return `‘${profile.tabLabels[profile.archiveSource]}’ 탭`;
  });

  const queryClient = useQueryClient();
  // 조직 공용이라 채널을 넘기지 않는다(키도 버전만 탄다)
  const archiveQuery = createQuery(() => svc.videoArchiveQueryOptions(version));
  const items = $derived<ArchivedVideo[]>(archiveQuery.data ?? []);
  const unarchiveMutation = createMutation(() =>
    svc.unarchiveVideoMutationOptions(queryClient, version, currentChannelId),
  );
  const deleteMutation = createMutation(() =>
    svc.deleteArchivedVideoMutationOptions(queryClient, version),
  );

  // 만든 사람. id → 이름/이메일 이고 Map 은 한 번만 짓는다(카드마다 재구성하지 않게).
  const identityOf = $derived(createMemberIdentityLookup(data.members));
  /** 보관물 id → 만든 사람 id. 그리드 콜백이 카드 id 만 주므로 여기서 되돌린다. */
  const ownerIdOf = $derived(new Map(items.map((f) => [f.id, f.ownerUserId])));
  const ownerOf = (id: number) => {
    const ownerId = ownerIdOf.get(id);
    return ownerId == null ? null : identityOf(ownerId);
  };
  /** 지울 수 있는가: 내가 만든 것이거나 내가 관리급(대표/팀장)이다. 실제 경계는 서버 */
  const canDelete = (id: number) =>
    data.canManageAll || ownerIdOf.get(id) === data.viewerUserId;

  // 검색과 필터. 판정은 순수 모듈이 하고 여기서는 기준을 들고 결과를 파생한다.
  const portrait = $derived(viewportModeStore.isPortrait);
  let criteria = $state<ArchiveFilterCriteria>({ ...DEFAULT_ARCHIVE_FILTER });
  const visible = $derived(filterArchivedVideos(items, criteria));

  // 워크스페이스와 같은 모드 관용: 보기+선택=꺼내기, 삭제 모드+선택=삭제
  let manageMode = $state<WorkspaceMode>('view');
  let selectedIds = $state<number[]>([]);
  function setMode(mode: WorkspaceMode): void {
    manageMode = mode;
    selectedIds = [];
  }

  // 필터로 화면에서 사라진 카드가 선택에 남으면 하단 바가 안 보이는 항목까지 세고 실행한다.
  //   보이는 것만 남긴다. 실제로 줄어들 때만 대입해 재실행 루프를 막는다.
  $effect(() => {
    const visibleIds = new Set(visible.map((f) => f.id));
    const kept = selectedIds.filter((id) => visibleIds.has(id));
    if (kept.length !== selectedIds.length) selectedIds = kept;
  });
  function toggleSelect(id: number): void {
    selectedIds = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
  }
  function runOnSelected(fn: (id: number) => void): void {
    selectedIds.forEach(fn);
    setMode('view');
  }

  // 선택은 보이는 것 안에서만 성립한다(위 $effect 가 그렇게 유지한다)
  const selectedItems = $derived(visible.filter((f) => selectedIds.includes(f.id)));
  /**
   * 삭제 모드에서 고를 수 있는 카드: 내가 만든 것, 그리고 관리급이면 남의 것까지
   *
   * 서버가 어차피 막는데도 화면에서 제한하는 이유: 막는 방식이 "조용히 아무 일도 안 일어남" 이라
   * 고를 수 있게 두면 사라지지 않은 이유를 알 수 없다. 꺼내기와 다운로드는 누구나 되므로 보기
   * 모드에선 제한하지 않는다.
   */
  const canSelectItem = $derived((id: number) =>
    manageMode === 'delete' ? canDelete(id) : true,
  );
  /** 완성본만 받는다. 렌더 중/실패는 결과 파일이 없다(보관물은 완성본뿐이라 사실상 전부) */
  const downloadItems = $derived(
    selectedItems
      .filter((f) => f.resultUrl && f.renderStatus === 'COMPLETED')
      .map((f) => ({ url: f.resultUrl as string, name: f.title })),
  );
  const download = createBulkDownload();

  /**
   * 하단 바: 자리 규칙을 워크스페이스 하단 바와 맞춘다: 위=다운로드(보조), 가운데=이동 액션
   * 다운로드가 화면마다 다른 자리에 있으면 같은 일을 하면서 매번 찾아야 한다.
   *   보기 모드   → 가운데 '꺼내기'(공용이라 남이 만든 것도 꺼낼 수 있다. 내 워크스페이스로 들어온다)
   *   삭제 모드   → 가운데 '삭제하기'. 내 것만 골라져 있다(그리드가 제한). 다운로드는 띄우지 않는다.
   *                 (지우려는 참에 받기 버튼은 산만하다)
   */
  const barAction = $derived(
    manageMode === 'delete'
      ? {
          label: '삭제하기',
          variant: 'danger' as const,
          pending: deleteMutation.isPending,
          run: (): void => runOnSelected((id) => deleteMutation.mutate(id)),
          showDownload: false,
        }
      : {
          label: '내 워크스페이스로 꺼내기',
          variant: 'primary' as const,
          pending: unarchiveMutation.isPending,
          run: (): void => runOnSelected((id) => unarchiveMutation.mutate(id)),
          showDownload: true,
        },
  );
</script>

<!-- 헤더: 모드 드롭다운은 항상 제목 줄 오른쪽 끝이다(방향과 무관)
     설명은 w-full 이라 스스로 다음 줄로 내려간다: 세로에서 설명이 드롭다운을 밀어내지 않고,
     가로에서도 같은 자리에 온다. 방향 분기가 필요 없어 마크업이 하나다. -->
<div class="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
  <h2 class="text-sm font-medium text-fg">보관함</h2>
  <!-- 삭제 모드는 지울 게 있을 때만 의미가 있다. -->
  {#if items.length > 0}
    <ModeDropdown value={manageMode} onChange={setMode} />
  {/if}
  <p class="w-full text-xs text-fg-subtle">
    조직에서 완성한 영상을 모아 둡니다. 내 워크스페이스로 다시 꺼내거나 내려받을 수 있습니다.
  </p>
</div>

<!-- 보관함이 아예 비었으면 필터할 것도 없다(툴바를 띄우면 빈 화면에 컨트롤만 남는다) -->
{#if items.length > 0}
  <ArchiveFilterBar
    bind:criteria
    {portrait}
    resultCount={visible.length}
    totalCount={items.length}
  />
{/if}

{#if items.length === 0 && !archiveQuery.isPending}
  <div
    class="flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 text-center text-fg-subtle"
  >
    <svg
      class="h-10 w-10 opacity-60"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
    <p class="text-sm">보관함이 비어 있습니다.</p>
    <p class="text-xs">{sourceLabel} 에서 완성본을 선택해 ‘보관함 보내기’ 를 누르면 여기에 모입니다.</p>
  </div>
{:else if visible.length === 0}
  <!-- 보관물은 있는데 조건에 안 맞는 경우. 위의 "비어 있음" 과 다른 상태라 문구도 다르다.
       (여기서 할 일은 보내는 것이 아니라 필터를 푸는 것이다) -->
  <div
    class="flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 text-center text-fg-subtle"
  >
    <svg
      class="h-10 w-10 opacity-60"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
    <p class="text-sm">조건에 맞는 영상이 없습니다.</p>
    <p class="text-xs">검색어나 필터를 바꿔 보세요.</p>
    {#if isArchiveFilterActive(criteria)}
      <button
        type="button"
        onclick={() => (criteria = resetArchiveFilter(criteria))}
        class="mt-1 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
      >
        필터 초기화
      </button>
    {/if}
  </div>
{:else}
  <!-- 보관물은 완성본뿐이라 '다시 만들기'를 제공하지 않는다(핸들러 미전달 → 버튼 숨김)
       필요하면 꺼낸 뒤 워크스페이스에서 재렌더한다. -->
  <!-- 공용이라 남의 것이 섞인다: ownerOf 로 만든 사람을 표시하고, 삭제 모드에선 내 것만 고르게 한다. -->
  <!-- 썸네일 따로 보기는 그 그림이 사람이 만든 썸네일인 버전에만 준다(워크스페이스와 같은 규칙)
       그 버전에서는 카드가 그 그림을 영상의 poster 로 얹지도 않는다: 영상에 들어간 것으로 읽힌다. -->
  <VideoProjectGrid
    projects={visible}
    selectable={true}
    {selectedIds}
    onToggleSelect={toggleSelect}
    {ownerOf}
    canSelectItem={canSelectItem}
    thumbnailPreview={humanThumbnails}
  />
{/if}

{#if selectedIds.length > 0}
  <!-- 위 보조 자리 = 다운로드(워크스페이스 최종 탭과 동일 위치) -->
  {#snippet downloadControl()}
    <DownloadSelectedButton
      items={downloadItems}
      state={download}
      onDownload={() => void download.run(downloadItems)}
    />
  {/snippet}
  <SelectionActionBar
    count={selectedIds.length}
    above={barAction.showDownload ? downloadControl : undefined}
    confirmLabel={barAction.label}
    variant={barAction.variant}
    pending={barAction.pending}
    onConfirm={barAction.run}
    onCancel={() => setMode('view')}
  />
{/if}
