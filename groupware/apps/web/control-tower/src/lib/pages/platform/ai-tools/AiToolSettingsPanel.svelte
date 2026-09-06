<script lang="ts">
  // AI 도구 설정 scene(인페이지): AI도구 관리 목록의 '설정' 버튼으로 전환해 들어온다.
  //   이 AI 도구의 공통 설정(플랫폼 관리)을 다룬다. tool.key 로 도구별 설정을 분기한다(확장 seam)
  //   URL(?settings=<key>)이 이 scene 의 단일 출처(부모 AiToolsPage 가 파생): 새로고침/뒤로가기/공유 복원
  import { AiToolKey } from '@csc/entitlements';
  import { viewportModeStore } from '$lib/shared/lib/stores/viewport/viewportModeStore/viewportModeStore.svelte';
  import type { AiToolCatalogItem } from '$lib/features/ai-tools/types';
  import type { AssetAxisView, CommonAsset } from '$lib/features/common-assets/types';
  import type { AssetSet } from '$lib/features/asset-sets/types';
  import MarketingVideoSettings from './MarketingVideoSettings.svelte';

  interface Props {
    tool: AiToolCatalogItem;
    // 공통 에셋 풀: marketing-video 설정에서만 사용(그 외 도구는 빈 배열). SSR 로드분
    commonAssets?: CommonAsset[];
    // 에셋 세트: marketing-video 설정에서만 사용. SSR 로드분(멤버 자산 resolve 포함)
    assetSets?: AssetSet[];
    // 태그 카탈로그(축+태그): marketing-video 설정에서만 사용. SSR 로드분
    axes?: AssetAxisView[];
    // 목록으로 돌아가기
    onBack: () => void;
  }
  let { tool, commonAssets = [], assetSets = [], axes = [], onBack }: Props = $props();

  // 도구별 설정 분기: marketing-video 는 공통 에셋 관리, 그 외는 준비중 placeholder.
  const isMarketingVideo = $derived(tool.key === AiToolKey.MarketingVideo);

  // 목록/편집 scene 과 동일 폭(반응형: landscape 가운데 정렬+폭 제한, portrait 전체폭)
  const narrow = $derived(!viewportModeStore.isPortrait);
  const containerClass = $derived(narrow ? 'mx-auto max-w-xl 2xl:max-w-2xl' : '');
</script>

<div class="space-y-5 {containerClass}">
  <!-- 뒤로가기(목록으로) -->
  <button
    type="button"
    onclick={onBack}
    class="inline-flex items-center gap-1 text-sm text-gray-500 transition hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
  >
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
    AI도구 목록
  </button>

  <header class="space-y-1">
    <h1 class="text-xl font-bold text-gray-900 sm:text-2xl">AI 도구 설정: {tool.name}</h1>
    <p class="text-sm text-gray-500">이 AI 도구의 공통 설정을 플랫폼에서 관리합니다.</p>
  </header>

  {#if isMarketingVideo}
    <!-- marketing-video 공통 설정: 세트(키트) + 자산 라이브러리 관리 -->
    <MarketingVideoSettings {commonAssets} {assetSets} {axes} />
  {:else}
    <!-- 그 외 도구: 공통 설정 준비중 -->
    <section class="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-5">
      <h2 class="mb-1 text-sm font-semibold text-gray-700">공통 설정</h2>
      <p class="text-sm text-gray-500">이 AI 도구의 공통(기본) 설정을 여기서 관리합니다. 준비중입니다.</p>
    </section>
  {/if}
</div>
