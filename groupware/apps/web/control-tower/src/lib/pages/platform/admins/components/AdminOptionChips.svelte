<script lang="ts">
  import type { AdminFeatureCatalogItem } from '$lib/features/admins/types';

  // 플랫폼 관리자 옵션(관리 영역 접근권) 칩 토글: 조직 AI도구 칩과 동일 톤. 저장은 부모가 일괄 처리
  let {
    catalog,
    selected,
    ontoggle,
  }: {
    catalog: AdminFeatureCatalogItem[];
    selected: string[];
    ontoggle: (key: string) => void;
  } = $props();
</script>

{#if catalog.length === 0}
  <p class="text-sm text-gray-400">부여 가능한 옵션이 없습니다.</p>
{:else}
  <div class="flex flex-wrap gap-2">
    {#each catalog as item (item.key)}
      {@const on = selected.includes(item.key)}
      <button
        type="button"
        onclick={() => ontoggle(item.key)}
        aria-pressed={on}
        title={item.description ?? undefined}
        class="rounded-full border px-3 py-1 text-sm transition-colors {on
          ? 'border-brand bg-brand text-white'
          : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}"
      >
        {item.name}
      </button>
    {/each}
  </div>
  <p class="mt-1 text-xs text-gray-500">선택한 영역만 이 관리자에게 노출, 허용됩니다. 저장 시 반영됩니다.</p>
{/if}
