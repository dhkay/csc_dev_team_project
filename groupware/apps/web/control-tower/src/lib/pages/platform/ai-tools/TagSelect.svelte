<script lang="ts">
  // 태그 선택(카탈로그): 한 축의 태그 선택지를 토글 칩으로. 플랫폼 큐레이션 목록에서만 선택
  //   공통/우리 조직 태그가 섞이면 나눠서 라벨을 붙인다(플랫폼 관리엔 보통 공통만. 그땐 라벨 없이 한 줄)
  //   selected 는 축 무관 전체 tagId 배열(양방향 바인딩): 각 인스턴스는 자기 축 태그만 토글(tagId 전역 유니크)
  import type { AssetTagView } from '$lib/features/common-assets/types';

  interface Props {
    tags: AssetTagView[];
    selected: number[];
    disabled?: boolean;
  }
  let { tags, selected = $bindable([]), disabled = false }: Props = $props();

  const commonTags = $derived(tags.filter((t) => t.scope !== 'organization'));
  const orgTags = $derived(tags.filter((t) => t.scope === 'organization'));
  const showLabels = $derived(commonTags.length > 0 && orgTags.length > 0);

  function toggle(id: number): void {
    if (disabled) return;
    selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
  }
</script>

{#snippet chip(tag: AssetTagView)}
  {@const on = selected.includes(tag.id)}
  <button
    type="button"
    onclick={() => toggle(tag.id)}
    {disabled}
    aria-pressed={on}
    class="rounded-full border px-2.5 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 {on
      ? 'border-transparent bg-brand/10 font-medium text-brand'
      : 'border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-800'}"
  >
    {tag.label}
  </button>
{/snippet}

{#if tags.length === 0}
  <span class="text-[11px] text-gray-400">등록된 태그가 없습니다.</span>
{:else}
  <div class="flex flex-col gap-1.5">
    {#if commonTags.length > 0}
      <div class="flex flex-wrap items-center gap-1.5">
        {#if showLabels}
          <span class="mr-0.5 shrink-0 rounded-full border border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-500">공통</span>
        {/if}
        {#each commonTags as tag (tag.id)}{@render chip(tag)}{/each}
      </div>
    {/if}
    {#if orgTags.length > 0}
      <div class="flex flex-wrap items-center gap-1.5">
        {#if showLabels}
          <span class="mr-0.5 shrink-0 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">우리 조직</span>
        {/if}
        {#each orgTags as tag (tag.id)}{@render chip(tag)}{/each}
      </div>
    {/if}
  </div>
{/if}
