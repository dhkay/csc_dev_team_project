<script lang="ts">
  // 플랫폼 AI도구 관리: 목록(마스터) ⇄ 편집/설정(디테일) 인페이지 scene 전환
  //   각 행의 연필=편집 scene(표시명/slug), 우측 '설정'=설정 scene(공통 설정). 저장/뒤로가기 시 목록 복귀(+갱신)
  //   scene 은 URL 이 단일 출처: ?edit=<key> / ?settings=<key>. 진입 시 URL 변경 → 새로고침/뒤로가기/링크공유로 복원
  //   AI 도구는 enum 으로 고정(추가/삭제 없음). 표시명/slug 및 공통 설정은 DB(userdb)가 단일 출처이며 편집 가능
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { ProvisioningMode } from '@csc/entitlements';
  import { viewportModeStore } from '$lib/shared/lib/stores/viewport/viewportModeStore/viewportModeStore.svelte';
  import AiToolEditPanel from './AiToolEditPanel.svelte';
  import AiToolSettingsPanel from './AiToolSettingsPanel.svelte';
  import type { AiToolCatalogItem } from '$lib/features/ai-tools/types';
  import type { AssetAxisView, CommonAsset } from '$lib/features/common-assets/types';
  import type { AssetSet } from '$lib/features/asset-sets/types';

  let {
    aiTools,
    loadError = false,
    commonAssets = [],
    assetSets = [],
    axes = [],
  }: {
    aiTools: AiToolCatalogItem[];
    loadError?: boolean;
    commonAssets?: CommonAsset[];
    assetSets?: AssetSet[];
    axes?: AssetAxisView[];
  } = $props();

  // 현재 scene 은 URL 쿼리에서 파생(?settings 우선 → ?edit → 목록). key 로 aiTools 에서 도구를 찾으므로
  //   저장 후 invalidateAll 로 목록이 갱신돼도 stale 하지 않고, 없는 key 면 목록으로 흘러간다.
  const settingsTool = $derived.by(() => {
    const key = page.url.searchParams.get('settings');
    return key ? (aiTools.find((t) => t.key === key) ?? null) : null;
  });
  const editing = $derived.by(() => {
    const key = page.url.searchParams.get('edit');
    return key ? (aiTools.find((t) => t.key === key) ?? null) : null;
  });

  // landscape(가로, 데스크톱)에서는 컬럼을 가운데 정렬 + 폭 제한(반응형: 큰 화면일수록 한 단계 더 넓게)
  //   portrait 은 전체폭. 편집/설정 scene 과 동일 폭이라 전환 시 컬럼이 유지된다.
  const narrow = $derived(!viewportModeStore.isPortrait);
  const containerClass = $derived(narrow ? 'mx-auto max-w-xl 2xl:max-w-2xl' : '');

  // 진입 = 쿼리만 교체(상대 goto 라 다른 쿼리는 드롭 → edit/settings 상호배타). push 라 브라우저 뒤로가기 = 목록
  function openEdit(key: string): void {
    void goto(`?edit=${encodeURIComponent(key)}`);
  }
  function openSettings(key: string): void {
    void goto(`?settings=${encodeURIComponent(key)}`);
  }
  // 목록으로: 쿼리 제거(pathname 만). 저장 시엔 목록 데이터도 갱신
  function back(): void {
    void goto(page.url.pathname);
  }
  async function onSaved(): Promise<void> {
    await invalidateAll();
    void goto(page.url.pathname);
  }
</script>

{#if settingsTool}
  <!-- 설정 scene(?settings=<key>): 목록의 '설정' 버튼으로 진입 -->
  <AiToolSettingsPanel tool={settingsTool} {commonAssets} {assetSets} {axes} onBack={back} />
{:else if editing}
  <!-- 편집 scene(?edit=<key>): 목록의 연필로 진입 -->
  <AiToolEditPanel tool={editing} onBack={back} {onSaved} />
{:else}
  <!-- 목록 scene(마스터) -->
  <div class="space-y-5 {containerClass}">
    <header class="space-y-1">
      <h1 class="text-xl font-bold text-gray-900 sm:text-2xl">AI도구 관리</h1>
      <p class="text-sm text-gray-500">
        플랫폼이 제공하는 AI 도구의 표시명, slug, 공통 설정을 관리합니다. 도구 자체는 코드로 정해져
        있어 이 화면에서 추가하거나 삭제하지 않습니다.
      </p>
    </header>

    <section class="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div class="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <h2 class="text-sm font-semibold text-gray-700">
          AI 도구 <span class="font-normal text-gray-400">({aiTools.length})</span>
        </h2>
      </div>

      {#if loadError}
        <p class="px-4 py-6 text-sm text-red-600">목록을 불러오지 못했습니다. 잠시 후 다시 시도하세요.</p>
      {:else if aiTools.length === 0}
        <p class="px-4 py-6 text-sm text-gray-400">등록된 AI 도구가 없습니다.</p>
      {:else}
        <!-- 각 행: 좌상단 연필(편집) + 도구 정보 + 우측 '설정' 버튼 -->
        <ul class="divide-y divide-gray-100">
          {#each aiTools as tool (tool.key)}
            <li class="flex items-start gap-2.5 px-4 py-3">
              <!-- 편집(연필): 중점을 텍스트 좌상단에 맞춘다(상단 정렬 + 첫 줄 캡 높이 보정) -->
              <button
                type="button"
                onclick={() => openEdit(tool.key)}
                aria-label={`${tool.name} 편집`}
                title="편집"
                class="mt-[3px] shrink-0 rounded p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
              >
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>

              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-gray-900">{tool.name}</span>
                {#if tool.description}
                  <span class="block truncate text-sm text-gray-500">{tool.description}</span>
                {/if}
              </span>

              <div class="flex shrink-0 items-center gap-3">
                <!-- 제공 방식: 조직에 부여하는 도구인지 전 조직 공통인지 목록에서 바로 구분한다.
                     들어가 보고서야 아는 상태면 조직 상세에서 부여하려다 되돌아 나오게 된다. -->
                <span
                  class="rounded-md px-2 py-0.5 text-xs font-medium {tool.provisioning ===
                  ProvisioningMode.Common
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'bg-gray-100 text-gray-600'}"
                >
                  {tool.provisioning === ProvisioningMode.Common ? '공통 제공' : '조직별 부여'}
                </span>
                <span class="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-500">
                  /{tool.slug}
                </span>
                <button
                  type="button"
                  onclick={() => openSettings(tool.key)}
                  class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                >
                  설정
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
{/if}
