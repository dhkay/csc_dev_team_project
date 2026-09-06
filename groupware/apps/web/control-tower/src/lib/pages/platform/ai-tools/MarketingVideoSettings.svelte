<script lang="ts">
  // marketing-video 자산 라이브러리: [세트 | 자산] 전환 토글(한 번에 하나만)
  //   세트 = 사람이 영상 제작 마지막에 직접 선택. 자산(샘플이미지, BGM, 효과음) = AI 가 그 이전에 자동 삽입
  import {
    COMMON_ASSET_CATEGORIES,
    COMMON_ASSET_CATEGORY_META,
    type AssetAxisView,
    type CommonAsset,
    type CommonAssetCategory,
  } from '$lib/features/common-assets/types';
  import type { AssetSet } from '$lib/features/asset-sets/types';
  import MarketingVideoSetSettings from './MarketingVideoSetSettings.svelte';
  import MarketingVideoAssetSettings from './MarketingVideoAssetSettings.svelte';

  interface Props {
    commonAssets: CommonAsset[];
    assetSets: AssetSet[];
    axes?: AssetAxisView[];
  }
  let { commonAssets, assetSets, axes = [] }: Props = $props();

  let view = $state<'set' | 'assets'>('set');
  let tab = $state<CommonAssetCategory>(COMMON_ASSET_CATEGORIES[0]);

  const poolTabs = $derived(
    COMMON_ASSET_CATEGORIES.map((c) => ({
      key: c,
      label: COMMON_ASSET_CATEGORY_META[c].label,
      count: commonAssets.filter((a) => a.category === c).length,
    })),
  );
</script>

<div class="space-y-4">
  <div class="flex flex-wrap items-center gap-2">
    <h2 class="text-sm font-semibold text-gray-700">자산 라이브러리</h2>
    <span class="rounded bg-brand/10 px-1.5 py-0.5 text-[11px] font-medium text-brand">공통</span>
    <span class="text-xs text-gray-400">모든 조직의 마케팅영상 도구에서 쓰이는 공통 자산입니다.</span>
  </div>

  <!-- 전환 토글: 세트(사람 직접 선택) | 자산(AI 자동 삽입) -->
  <div class="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-sm">
    <button
      type="button"
      onclick={() => (view = 'set')}
      class="rounded-md px-3 py-1 transition {view === 'set'
        ? 'bg-white font-medium text-gray-900 shadow-sm'
        : 'text-gray-500 hover:text-gray-800'}"
    >
      세트 <span class="text-xs text-gray-400">{assetSets.length}</span>
    </button>
    <button
      type="button"
      onclick={() => (view = 'assets')}
      class="rounded-md px-3 py-1 transition {view === 'assets'
        ? 'bg-white font-medium text-gray-900 shadow-sm'
        : 'text-gray-500 hover:text-gray-800'}"
    >
      자산 <span class="text-xs text-gray-400">{commonAssets.length}</span>
    </button>
  </div>

  {#if view === 'set'}
    <p class="text-xs text-gray-400">배경프레임 + 아웃트로 세트. 사람이 영상 제작 마지막에 직접 선택합니다.</p>
    <MarketingVideoSetSettings {assetSets} {commonAssets} />
  {:else}
    <p class="text-xs text-gray-400">샘플이미지 / BGM / 효과음. AI 가 영상 제작 시 자동으로 삽입합니다.</p>
    <div class="flex flex-wrap gap-1 border-b border-gray-200" role="tablist">
      {#each poolTabs as t (t.key)}
        <button
          type="button"
          role="tab"
          aria-selected={tab === t.key}
          onclick={() => (tab = t.key)}
          class="-mb-px border-b-2 px-3 py-1.5 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 {tab === t.key
            ? 'border-brand font-medium text-gray-900'
            : 'border-transparent text-gray-500 hover:text-gray-800'}"
        >
          {t.label}
          <span class="text-xs text-gray-400">{t.count}</span>
        </button>
      {/each}
    </div>
    <MarketingVideoAssetSettings category={tab} {commonAssets} {axes} />
  {/if}
</div>
