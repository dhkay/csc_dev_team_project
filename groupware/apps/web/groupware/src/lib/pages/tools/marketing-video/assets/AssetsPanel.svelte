<script lang="ts">
  // 에셋 라이브러리: [세트 | 자산] 전환 토글(한 번에 하나만)
  //   세트 = 사람이 영상 제작 마지막에 직접 선택. 자산(샘플이미지, BGM, 효과음) = AI 가 그 이전에 자동 삽입
  //   플랫폼 공통(읽기전용) + 조직(ROOT/대표/팀장 편집)을 함께. 뷰/탭은 컴포넌트 상태(패널 자체 소유)
  import {
    MARKETING_ASSET_CATEGORY_META,
    type AssetAxisView,
    type CommonAssetView,
    type AssetSetView,
    type MarketingAssetCategory,
  } from '$lib/features/marketing-assets/types';
  import AssetPoolSection from './AssetPoolSection.svelte';
  import AssetSetSection from './AssetSetSection.svelte';

  interface Props {
    commonAssets?: CommonAssetView[];
    assetSets?: AssetSetView[];
    // 조직 자산 편집 권한(ROOT/대표/팀장). false 면 전부 읽기전용
    canManage?: boolean;
    // 태그 카탈로그(축+태그): SSR 로드분. 태깅 UI 가 카테고리별로 필터해 사용
    axes?: AssetAxisView[];
  }
  let { commonAssets = [], assetSets = [], canManage = false, axes = [] }: Props = $props();

  let view = $state<'set' | 'assets'>('set');
  let category = $state<MarketingAssetCategory>('SAMPLE_IMAGE');

  const POOL_TABS: MarketingAssetCategory[] = ['SAMPLE_IMAGE', 'BGM', 'SFX', 'FONT'];
  const poolTabs = $derived(
    POOL_TABS.map((c) => ({
      key: c,
      label: MARKETING_ASSET_CATEGORY_META[c].label,
      count: commonAssets.filter((a) => a.category === c).length,
    })),
  );
</script>

<div class="flex h-full min-h-0 flex-col gap-3">
  <div class="flex shrink-0 flex-wrap items-baseline gap-2">
    <h3 class="text-sm font-medium text-fg">에셋</h3>
    <span class="text-xs text-fg-subtle">
      플랫폼 공통 + 우리 조직 자산{canManage ? '' : ', 읽기 전용'}
    </span>
  </div>

  <!-- 전환 토글: 세트(사람 직접 선택) | 자산(AI 자동 삽입) -->
  <div class="inline-flex shrink-0 self-start rounded-lg border border-line bg-elevated p-0.5 text-sm">
    <button
      type="button"
      onclick={() => (view = 'set')}
      class="rounded-md px-3 py-1 transition {view === 'set'
        ? 'bg-surface font-medium text-fg shadow-sm'
        : 'text-fg-subtle hover:text-fg'}"
    >
      세트 <span class="text-xs text-fg-subtle">{assetSets.length}</span>
    </button>
    <button
      type="button"
      onclick={() => (view = 'assets')}
      class="rounded-md px-3 py-1 transition {view === 'assets'
        ? 'bg-surface font-medium text-fg shadow-sm'
        : 'text-fg-subtle hover:text-fg'}"
    >
      자산 <span class="text-xs text-fg-subtle">{commonAssets.length}</span>
    </button>
  </div>

  {#if view === 'set'}
    <p class="shrink-0 text-xs text-fg-subtle">프레임 + 아웃트로 세트. 사람이 영상 제작 마지막에 직접 선택합니다.</p>
    <div class="min-h-0 flex-1 overflow-y-auto pr-0.5">
      <AssetSetSection {assetSets} {canManage} {commonAssets} />
    </div>
  {:else}
    <p class="shrink-0 text-xs text-fg-subtle">샘플이미지 / BGM / 효과음. AI 가 영상 제작 시 자동으로 삽입합니다.</p>
    <div class="flex shrink-0 flex-wrap gap-1 border-b border-line" role="tablist">
      {#each poolTabs as t (t.key)}
        <button
          type="button"
          role="tab"
          aria-selected={category === t.key}
          onclick={() => (category = t.key)}
          class="-mb-px border-b-2 px-3 py-1.5 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 {category === t.key
            ? 'border-fg font-medium text-fg'
            : 'border-transparent text-fg-subtle hover:text-fg'}"
        >
          {t.label} <span class="text-xs text-fg-subtle">{t.count}</span>
        </button>
      {/each}
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto pr-0.5">
      <AssetPoolSection {category} {commonAssets} {canManage} {axes} />
    </div>
  {/if}
</div>
