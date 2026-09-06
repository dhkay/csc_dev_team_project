<script lang="ts">
  import { untrack } from 'svelte';
  // AI 도구 편집 scene(인페이지): AI도구 관리 목록에서 좌측 연필(편집) 버튼으로 전환해 들어온다.
  //   표시명/slug 를 편집한다. 공통 설정은 별도 scene(AiToolSettingsPanel, 목록의 '설정' 버튼)
  //   저장 성공/뒤로가기 시 부모(AiToolsPage)가 목록 scene 으로 되돌린다.
  import { ALL_PROVISIONING_MODES, PROVISIONING_LABELS, ProvisioningMode } from '@csc/entitlements';
  import { viewportModeStore } from '$lib/shared/lib/stores/viewport/viewportModeStore/viewportModeStore.svelte';
  import { aiToolsService } from '$lib/features/ai-tools/services/aiTools.service';
  import type { AiToolCatalogItem } from '$lib/features/ai-tools/types';

  interface Props {
    tool: AiToolCatalogItem;
    // 목록으로 돌아가기
    onBack: () => void;
    // 저장 성공: 부모가 목록 갱신 + 목록 scene 으로 복귀
    onSaved: () => void;
  }
  let { tool, onBack, onSaved }: Props = $props();

  // 편집 폼: 원본(초기값)은 변경 여부(dirty) 판정/되돌리기에 쓴다.
  let name = $state(untrack(() => tool.name));
  let slug = $state(untrack(() => tool.slug));
  let provisioning = $state<ProvisioningMode>(untrack(() => tool.provisioning));
  let saving = $state(false);
  let saveError = $state('');
  let slugError = $state('');

  const dirty = $derived(
    name !== tool.name || slug !== tool.slug || provisioning !== tool.provisioning,
  );

  // landscape(가로, 데스크톱)에서는 폼을 가운데 정렬 + 폭 제한(반응형: 큰 화면일수록 한 단계 더 넓게)
  //   portrait 은 전체폭. 목록 scene(AiToolsPage)과 동일 폭
  const narrow = $derived(!viewportModeStore.isPortrait);
  const containerClass = $derived(narrow ? 'mx-auto max-w-xl 2xl:max-w-2xl' : '');

  function revert(): void {
    name = tool.name;
    slug = tool.slug;
    provisioning = tool.provisioning;
    saveError = '';
    slugError = '';
  }

  async function doSave(): Promise<void> {
    if (saving) return;
    saveError = '';
    slugError = '';
    if (!name.trim()) {
      saveError = '표시명을 입력하세요.';
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      slugError = 'slug 은 소문자/숫자/하이픈만 허용합니다.';
      return;
    }
    saving = true;
    try {
      const result = await aiToolsService.update(tool.key, {
        name: name.trim(),
        slug: slug.trim(),
        provisioning,
      });
      if (!result.success) {
        if (result.errorCode === 'SLUG_TAKEN') slugError = '이미 사용 중인 slug 입니다.';
        else if (result.errorCode === 'INVALID_INPUT') slugError = result.error ?? '입력값을 확인하세요.';
        else saveError = result.error ?? '수정에 실패했습니다.';
        return;
      }
      onSaved();
    } catch (e) {
      saveError = e instanceof Error ? e.message : '네트워크 오류로 실패했습니다.';
    } finally {
      saving = false;
    }
  }
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
    <h1 class="text-xl font-bold text-gray-900 sm:text-2xl">AI 도구 편집: {tool.name}</h1>
    <p class="text-sm text-gray-500">그룹웨어에 노출되는 표시명과 라우팅 slug 를 수정합니다. (식별자는 변경할 수 없습니다)</p>
  </header>

  <!-- 기본 정보(표시명/slug) -->
  <section class="rounded-lg border border-gray-200 bg-white p-5">
    <h2 class="mb-4 text-sm font-semibold text-gray-700">기본 정보</h2>
    <form id="edit-ai-tool-form" onsubmit={(e) => { e.preventDefault(); void doSave(); }} class="space-y-4">
      <div>
        <span class="mb-1 block text-sm font-medium text-gray-700">식별자(key)</span>
        <p class="rounded-lg bg-gray-100 px-3 py-2 font-mono text-sm text-gray-500">{tool.key}</p>
      </div>

      <div>
        <label for="edit-name" class="mb-1 block text-sm font-medium text-gray-700">표시명</label>
        <input
          id="edit-name"
          bind:value={name}
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <p class="mt-1 text-xs text-gray-500">그룹웨어에 노출되는 이름입니다.</p>
      </div>

      <div>
        <label for="edit-slug" class="mb-1 block text-sm font-medium text-gray-700">slug</label>
        <input
          id="edit-slug"
          bind:value={slug}
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        {#if slugError}
          <p class="mt-1 text-xs text-red-600">{slugError}</p>
        {:else}
          <p class="mt-1 text-xs text-gray-500">라우팅 경로에 쓰입니다(소문자/숫자/하이픈). 예: /조직slug/<b>{slug || 'slug'}</b></p>
        {/if}
      </div>

      <div>
        <span class="mb-1 block text-sm font-medium text-gray-700">제공 방식</span>
        <!-- 프로비저닝: 개별 부여(조직마다 grant) vs 공통 제공(전 조직 자동). 세그먼트 토글 -->
        <div class="inline-flex rounded-lg border border-gray-300 p-0.5">
          {#each ALL_PROVISIONING_MODES as mode (mode)}
            <button
              type="button"
              onclick={() => (provisioning = mode)}
              aria-pressed={provisioning === mode}
              class="rounded-md px-3 py-1.5 text-sm font-medium transition {provisioning === mode
                ? 'bg-brand text-white'
                : 'text-gray-600 hover:bg-gray-50'}"
            >
              {PROVISIONING_LABELS[mode]}
            </button>
          {/each}
        </div>
        <p class="mt-1 text-xs text-gray-500">
          {provisioning === ProvisioningMode.Common
            ? '전 조직에 자동 제공됩니다. 조직별 부여가 필요 없고, 조직 상세에서는 읽기전용으로 표시됩니다.'
            : '조직마다 개별 부여해야 사용할 수 있습니다(조직 상세에서 토글).'}
        </p>
      </div>

      {#if tool.description}
        <div>
          <span class="mb-1 block text-sm font-medium text-gray-700">설명</span>
          <p class="text-sm text-gray-500">{tool.description}</p>
        </div>
      {/if}

      {#if saveError}
        <p class="text-sm text-red-600">{saveError}</p>
      {/if}
    </form>
  </section>

  <!-- 되돌리기(취소) + 저장: 변경이 없으면 비활성화 -->
  <footer class="flex justify-end gap-2">
    <button
      type="button"
      onclick={revert}
      disabled={saving || !dirty}
      class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      되돌리기
    </button>
    <button
      type="submit"
      form="edit-ai-tool-form"
      disabled={saving || !dirty}
      class="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {saving ? '저장 중…' : '저장'}
    </button>
  </footer>
</div>
