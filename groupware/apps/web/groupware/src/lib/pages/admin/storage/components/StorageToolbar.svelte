<script lang="ts">
  // 상단 도구 모음: 업로드, 정렬, 검색
  //
  // 권한이 없어 못 하는 동작은 숨기지 않고 잠근다. 숨기면 규칙이 보이지 않아 "왜 나는 안 되나"
  // 를 묻게 된다. 잠근 이유는 permissions.ts 가 준 문장을 그대로 툴팁에 단다.
  import { untrack } from 'svelte';
  import SearchInput from '$lib/shared/ui/controls/SearchInput.svelte';
  import { FILTER_CONTROL } from '$lib/shared/ui/controls/controlClasses';
  import { STORAGE_SORTS } from '$lib/features/storage/lib/sort';
  import type { Verdict } from '$lib/features/storage/lib/permissions';
  import type { StorageSortId } from '$lib/features/storage/types';

  interface Props {
    title: string;
    subtitle: string;
    upload: Verdict;
    sort: StorageSortId;
    search: string;
    trashed: boolean;
    onPickFiles: () => void;
    onSortChange: (sort: StorageSortId) => void;
    onSearchChange: (value: string) => void;
  }
  let {
    title,
    subtitle,
    upload,
    sort,
    search,
    trashed,
    onPickFiles,
    onSortChange,
    onSearchChange
  }: Props = $props();

  // 입력 중인 값은 주소에 바로 반영하지 않는다(글자마다 조회하지 않기 위해). 그래서 로컬 상태를
  //   따로 두고, 주소가 바깥에서 바뀔 때만(뒤로 가기, 영역 전환) 되맞춘다.
  //   초기값은 의도적으로 마운트 시점의 것을 잡는다(untrack): 그 뒤의 동기화는 아래 효과가 한다.
  let searchValue = $state(untrack(() => search));
  $effect(() => {
    searchValue = search;
  });
</script>

<header class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
  <div class="min-w-0">
    <h1 class="truncate text-lg font-semibold text-fg">{title}</h1>
    <p class="truncate text-xs text-fg-subtle">{subtitle}</p>
  </div>

  <!-- 좁은 화면에서는 검색이 한 줄을 다 쓰고 나머지 컨트롤이 다음 줄로 감싼다(보관함 툴바와 같은 관용) -->
  <div class="flex w-full flex-wrap items-center gap-2 lg:w-auto">
    <!-- form 으로 감싸는 이유: 검색창에서 Enter 를 눌렀을 때도 같은 동작이 돌아야 한다. -->
    <form
      class="flex w-full items-center gap-2 lg:w-auto"
      onsubmit={(e) => {
        e.preventDefault();
        onSearchChange(searchValue);
      }}
    >
      <SearchInput
        bind:value={searchValue}
        placeholder="파일 이름 검색"
        class="flex-1 lg:w-56 lg:flex-none"
      />
      <button
        type="submit"
        class="rounded-md border border-line px-2.5 py-1.5 text-sm text-fg-subtle transition hover:bg-hover hover:text-fg"
      >
        검색
      </button>
    </form>

    <label class="sr-only" for="storage-sort">정렬</label>
    <select
      id="storage-sort"
      class={FILTER_CONTROL}
      value={sort}
      onchange={(e) => onSortChange(e.currentTarget.value as StorageSortId)}
    >
      {#each STORAGE_SORTS as option (option.id)}
        <option value={option.id}>{option.label}</option>
      {/each}
    </select>

    {#if !trashed}
      <button
        type="button"
        onclick={onPickFiles}
        disabled={!upload.allowed}
        title={upload.reason}
        class="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        업로드
      </button>
    {/if}
  </div>
</header>
