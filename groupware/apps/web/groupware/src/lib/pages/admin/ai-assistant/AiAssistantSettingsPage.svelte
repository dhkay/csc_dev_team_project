<script lang="ts">
  // 조직 AI 어시스턴트 설정: 조직 관리자(루트 권한자)가 조직 기본 모델과 프롬프트 추가를 편집한다.
  //   플랫폼은 전역 활성(킬스위치)과 공통 프롬프트만 정하고, 어떤 모델을 쓸지는 여기서 조직이 고른다.
  //   저장은 service → BFF → csc-groupware(groupwaredb)
  import { untrack } from 'svelte';
  import { assistantSettingsService } from '$lib/features/assistant-settings/services/assistantSettings.service';
  import type {
    AssistantModelOption,
    OrganizationAssistantSettings,
  } from '$lib/features/assistant-settings/types';

  interface Props {
    settings: OrganizationAssistantSettings;
    // 조직 기본 모델 후보: language-model 카탈로그 전체
    models: AssistantModelOption[];
  }
  let { settings, models }: Props = $props();

  // 마운트 시점 스냅샷을 의도적으로 잡는다(untrack): 편집 사본과 dirty 판정 baseline 이다.
  //   props 가 나중에 갱신되어도 따라가면 안 된다. 저장 성공 시 baseline 은 이 컴포넌트가 직접 옮긴다.
  //   untrack 이 없으면 컴파일러가 "초기값만 잡힌다"고 경고하는데, 여기서는 그게 바로 원하는 동작이다.
  let promptAddition = $state(untrack(() => settings.promptAddition ?? ''));
  let defaultModel = $state(untrack(() => settings.defaultModel ?? ''));
  let basePrompt = $state(untrack(() => settings.promptAddition ?? ''));
  let baseDefault = $state(untrack(() => settings.defaultModel ?? ''));
  let saving = $state(false);
  let saveError = $state('');
  let saved = $state(false);

  const dirty = $derived(promptAddition !== basePrompt || defaultModel !== baseDefault);

  function revert(): void {
    promptAddition = basePrompt;
    defaultModel = baseDefault;
    saveError = '';
  }

  async function doSave(): Promise<void> {
    if (saving || !dirty) return;
    saving = true;
    saveError = '';
    saved = false;
    try {
      const result = await assistantSettingsService.update({
        promptAddition: promptAddition.trim() === '' ? null : promptAddition,
        defaultModel: defaultModel === '' ? null : defaultModel,
      });
      if (!result.success) {
        saveError = result.error ?? '저장에 실패했습니다.';
        return;
      }
      basePrompt = promptAddition;
      baseDefault = defaultModel;
      saved = true;
    } catch (e) {
      saveError = e instanceof Error ? e.message : '네트워크 오류로 실패했습니다.';
    } finally {
      saving = false;
    }
  }
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-1">
  <header class="flex flex-col gap-1">
    <h1 class="text-lg font-semibold text-fg">AI 어시스턴트</h1>
    <p class="text-sm text-fg-subtle">
      우리 조직의 AI 어시스턴트 설정입니다. 플랫폼 공통 설정 위에 조직만의 지침을 더합니다.
    </p>
  </header>

  <section class="rounded-lg border border-line bg-surface p-5">
    <label for="org-prompt-addition" class="mb-1 block text-sm font-semibold text-fg">
      조직 프롬프트 추가
    </label>
    <p class="mb-2 text-xs text-fg-subtle">
      플랫폼 공통 프롬프트 뒤에 이어붙는 조직 전용 지침/말투입니다. 비우면 공통 프롬프트만 사용합니다.
    </p>
    <textarea
      id="org-prompt-addition"
      bind:value={promptAddition}
      rows="6"
      placeholder="예: 답변은 항상 존댓말로, 회사 내부 용어(예: 그룹웨어)를 우선 사용하세요."
      class="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15"
    ></textarea>
  </section>

  <!-- 조직 기본 모델 -->
  <section class="rounded-lg border border-line bg-surface p-5">
    <label for="org-default-model" class="mb-1 block text-sm font-semibold text-fg">
      조직 기본 모델
    </label>
    <p class="mb-2 text-xs text-fg-subtle">
      우리 조직의 어시스턴트가 기본으로 쓸 모델입니다. 비우면 내장 Qwen 을 사용합니다.
      외부 모델은 조직 API 키를 등록해야 실제로 동작합니다.
    </p>
    {#if models.length === 0}
      <p class="text-sm text-fg-subtle">선택 가능한 모델이 없습니다.</p>
    {:else}
      <select
        id="org-default-model"
        bind:value={defaultModel}
        class="w-full max-w-sm rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15"
      >
        <option value="">(기본: 내장 Qwen)</option>
        {#each models as m (m.key)}
          <option value={m.key}>{m.label}{m.serving === 'api' ? ' (외부, 키 필요)' : ''}</option>
        {/each}
      </select>
    {/if}
  </section>

  {#if saveError}
    <p class="text-sm text-danger-fg">{saveError}</p>
  {:else if saved && !dirty}
    <p class="text-sm text-success-fg">저장되었습니다.</p>
  {/if}

  <footer class="flex justify-end gap-2">
    <button
      type="button"
      onclick={revert}
      disabled={saving || !dirty}
      class="rounded-lg border border-line px-4 py-2 text-sm font-medium text-fg-subtle transition hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
    >
      되돌리기
    </button>
    <button
      type="button"
      onclick={doSave}
      disabled={saving || !dirty}
      class="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {saving ? '저장 중…' : '저장'}
    </button>
  </footer>
</div>
