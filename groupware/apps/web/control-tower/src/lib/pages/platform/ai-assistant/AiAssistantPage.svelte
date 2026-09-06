<script lang="ts">
  import { untrack } from 'svelte';
  // 플랫폼 AI 어시스턴트 전역 설정: 전 조직 공통 기준을 플랫폼 관리자가 조정한다.
  //   여기서 정하는 건 둘뿐이다: 전역 활성(킬스위치)과 공통 시스템 프롬프트
  //   어떤 모델을 쓸지는 각 조직이 정한다(그룹웨어 조직 관리 > AI 어시스턴트). 조직도 안 정하면
  //   내장 Qwen 으로 떨어진다. 외부 모델은 조직이 자기 API 키를 등록해야 동작하므로 플랫폼 허용
  //   목록은 실효 없이 설정만 늘렸고, 그래서 걷어냈다.
  //   저장은 assistantSettingsService.update → BFF → control-tower → user(userdb 싱글톤)
  import { assistantSettingsService } from '$lib/features/assistant-settings/services/assistantSettings.service';
  import type { PlatformAssistantSettings } from '$lib/features/assistant-settings/types';

  interface Props {
    settings: PlatformAssistantSettings;
  }
  let { settings }: Props = $props();

  // 편집 상태(초기값 = 서버 로드). baseline 으로 dirty/되돌리기 판정
  let globalEnabled = $state(untrack(() => settings.globalEnabled));
  let commonPrompt = $state(untrack(() => settings.commonPrompt ?? ''));
  // baseline 은 저장 성공 시 갱신(반응형)
  let baseEnabled = $state(untrack(() => settings.globalEnabled));
  let basePrompt = $state(untrack(() => settings.commonPrompt ?? ''));

  let saving = $state(false);
  let saveError = $state('');
  let saved = $state(false);

  const dirty = $derived(globalEnabled !== baseEnabled || commonPrompt !== basePrompt);

  function revert(): void {
    globalEnabled = baseEnabled;
    commonPrompt = basePrompt;
    saveError = '';
  }

  async function doSave(): Promise<void> {
    if (saving || !dirty) return;
    saving = true;
    saveError = '';
    saved = false;
    try {
      const result = await assistantSettingsService.update({
        globalEnabled,
        // 빈 문자열이면 공통 프롬프트 해제(null)
        commonPrompt: commonPrompt.trim() === '' ? null : commonPrompt,
      });
      if (!result.success) {
        saveError = result.error ?? '저장에 실패했습니다.';
        return;
      }
      baseEnabled = globalEnabled;
      basePrompt = commonPrompt;
      saved = true;
    } catch (e) {
      saveError = e instanceof Error ? e.message : '네트워크 오류로 실패했습니다.';
    } finally {
      saving = false;
    }
  }
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
  <header class="flex flex-col gap-1">
    <h1 class="text-xl font-bold text-gray-900 sm:text-2xl">AI 어시스턴트</h1>
    <p class="text-sm text-gray-500">
      전 조직에 공통 제공되는 대화형 AI 챗봇의 전역 설정입니다. 여기서 정한 기준은 모든 조직에 적용됩니다.
      사용할 모델은 각 조직이 조직 관리에서 직접 고릅니다(미설정 시 내장 Qwen).
    </p>
  </header>

  <!-- 전역 활성화(킬스위치) -->
  <section class="rounded-lg border border-gray-200 bg-white p-5">
    <div class="flex items-start justify-between gap-4">
      <div class="flex flex-col gap-0.5">
        <span class="text-sm font-semibold text-gray-700">전역 활성화</span>
        <span class="text-xs text-gray-500">
          끄면 모든 조직에서 AI 어시스턴트가 즉시 중단됩니다(킬스위치).
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={globalEnabled}
        aria-label="AI 어시스턴트 전역 활성화"
        onclick={() => (globalEnabled = !globalEnabled)}
        class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 {globalEnabled
          ? 'bg-brand'
          : 'bg-gray-300'}"
      >
        <span
          class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform {globalEnabled
            ? 'translate-x-5'
            : 'translate-x-0.5'}"
        ></span>
      </button>
    </div>
  </section>

  <!-- 공통 시스템 프롬프트/페르소나 -->
  <section class="rounded-lg border border-gray-200 bg-white p-5">
    <label for="common-prompt" class="mb-1 block text-sm font-semibold text-gray-700">
      공통 시스템 프롬프트
    </label>
    <p class="mb-2 text-xs text-gray-500">
      전 조직 어시스턴트의 기본 성격/지침입니다. 조직별 추가 프롬프트가 이 위에 이어붙습니다. 비우면 기본값을 사용합니다.
    </p>
    <textarea
      id="common-prompt"
      bind:value={commonPrompt}
      rows="6"
      placeholder="예: 당신은 사내 AI 워크스페이스의 도움을 주는 AI 어시스턴트입니다…"
      class="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
    ></textarea>
  </section>

  {#if saveError}
    <p class="text-sm text-red-600">{saveError}</p>
  {:else if saved && !dirty}
    <p class="text-sm text-emerald-600">저장되었습니다.</p>
  {/if}

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
      type="button"
      onclick={doSave}
      disabled={saving || !dirty}
      class="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {saving ? '저장 중…' : '저장'}
    </button>
  </footer>
</div>
