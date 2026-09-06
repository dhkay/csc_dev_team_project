<script lang="ts">
  // 태그 선택(카탈로그): 한 축의 태그 선택지를 토글 칩으로. 플랫폼이 큐레이션한 목록에서만 고른다(자유입력 폐기)
  //   공통(플랫폼)과 우리 조직 태그가 섞여 있으면 둘을 나눠 라벨을 붙여 어떤 게 공통인지 보인다.
  //   selected 는 축 무관 전체 tagId 배열(양방향 바인딩): 각 인스턴스는 자기 축 태그만 토글한다(tagId 전역 유니크)
  import type { AssetTagView } from '$lib/features/marketing-assets/types';

  interface Props {
    tags: AssetTagView[];
    selected: number[];
    disabled?: boolean;
  }
  let { tags, selected = $bindable([]), disabled = false }: Props = $props();

  const commonTags = $derived(tags.filter((t) => t.scope !== 'organization'));
  const orgTags = $derived(tags.filter((t) => t.scope === 'organization'));
  // 두 스코프가 다 있을 때만 그룹 라벨(공통/우리 조직)을 붙인다. 한쪽만 있으면 라벨 없이 한 줄
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
    class="rounded-full border px-2.5 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 {on
      ? 'border-transparent bg-accent-bg font-medium text-accent-fg'
      : 'border-line text-fg-subtle hover:border-fg/40 hover:text-fg'}"
  >
    {tag.label}
  </button>
{/snippet}

{#if tags.length === 0}
  <span class="text-[11px] text-fg-subtle">등록된 태그가 없습니다.</span>
{:else}
  <div class="flex flex-col gap-1.5">
    {#if commonTags.length > 0}
      <div class="flex flex-wrap items-center gap-1.5">
        {#if showLabels}
          <span class="mr-0.5 shrink-0 rounded-full border border-line px-1.5 py-0.5 text-[10px] text-fg-subtle">공통</span>
        {/if}
        {#each commonTags as tag (tag.id)}{@render chip(tag)}{/each}
      </div>
    {/if}
    {#if orgTags.length > 0}
      <div class="flex flex-wrap items-center gap-1.5">
        {#if showLabels}
          <span class="mr-0.5 shrink-0 rounded-full bg-accent-bg px-1.5 py-0.5 text-[10px] font-medium text-accent-fg">우리 조직</span>
        {/if}
        {#each orgTags as tag (tag.id)}{@render chip(tag)}{/each}
      </div>
    {/if}
  </div>
{/if}
