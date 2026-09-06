<script lang="ts">
  // 보관함 검색/필터 툴바: 화면 방향에 따라 배치가 바뀐다.
  //   가로: 한 줄에 [검색(고정폭) 기간 정렬 … 결과수 초기화]
  //   세로: 검색이 전체 폭을 먹어 줄을 가르고, 나머지 컨트롤이 아래 줄에서 감싼다.
  //   (portrait 관용구: 폭만 바꾸고 마크업은 하나다.)
  //
  // 작업자 컨트롤이 없다: 보관함이 개인 것이 되면서 목록에 남이 없다(고를 사람도, 가릴 것도 없다)
  //
  // 필터 판정 로직은 갖지 않는다. 순수 모듈(archiveFilter)이 소유하고, 여기선 기준을 편집만 한다.
  import SearchInput from '$lib/shared/ui/controls/SearchInput.svelte';
  import { FILTER_CONTROL } from '$lib/shared/ui/controls/controlClasses';
  import {
    ARCHIVE_SORTS,
    isArchiveFilterActive,
    resetArchiveFilter,
    type ArchiveFilterCriteria,
    type ArchiveSortId,
  } from '$lib/features/marketing-channels/lib/archiveFilter';

  interface Props {
    criteria: ArchiveFilterCriteria;
    portrait?: boolean;
    // 필터 통과 건수 / 전체 건수: 필터가 걸렸을 때만 보여 준다.
    resultCount: number;
    totalCount: number;
  }
  let {
    criteria = $bindable(),
    portrait = false,
    resultCount,
    totalCount,
  }: Props = $props();

  const active = $derived(isArchiveFilterActive(criteria));
</script>

<div class="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3">
  <!-- 세로에서는 검색이 한 줄을 다 쓰고, 뒤 컨트롤이 자연스럽게 다음 줄로 넘어간다. -->
  <SearchInput
    bind:value={criteria.search}
    placeholder="제목 검색"
    class={portrait ? 'w-full' : 'w-72'}
  />

  <div class="flex items-center gap-1 text-xs text-fg-subtle">
    <input type="date" bind:value={criteria.since} aria-label="시작일" class={FILTER_CONTROL} />
    <span aria-hidden="true">~</span>
    <input type="date" bind:value={criteria.until} aria-label="종료일" class={FILTER_CONTROL} />
  </div>

  <select
    bind:value={criteria.sort}
    aria-label="정렬"
    class="{FILTER_CONTROL} {portrait ? 'flex-1' : ''}"
  >
    <!-- 정렬 카탈로그를 그대로 렌더: 종류 추가는 archiveFilter 배열 한 줄이면 여기 자동 반영 -->
    {#each ARCHIVE_SORTS as sort (sort.id)}
      <option value={sort.id as ArchiveSortId}>{sort.label}</option>
    {/each}
  </select>

  {#if active}
    <span class="ml-auto text-xs whitespace-nowrap text-fg-subtle" role="status" aria-live="polite">
      {resultCount} / 전체 {totalCount}
    </span>
    <button
      type="button"
      onclick={() => (criteria = resetArchiveFilter(criteria))}
      class="h-8 shrink-0 rounded-md border border-line px-3 text-xs font-medium text-fg-muted transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
    >
      초기화
    </button>
  {/if}
</div>
