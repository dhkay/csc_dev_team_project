<script lang="ts">
  // 기획서 생성 프롬프트 편집기: 기획서 생성 모달의 헤더 프롬프트 버튼으로 연다.
  //  - 프롬프트는 [고정 앞부분] + [편집 가능한 중간 지침] + [고정 뒷부분(JSON 스키마)] 구조
  //  - 작업자는 "중간 지침"만 수정한다(앞/뒤는 출력 계약이라 고정, 읽기 전용으로 보여준다)
  //  - 저장하면 채널 × 버전별로 보관되고, 그 지침이 최종 프롬프트의 중간에 끼워져 생성에 쓰인다.
  //
  // 언어: 한국어 한 벌이라 화면에 보이는 값이 그대로 모델에 나간다. 영어 원문과 화면용 번역을
  // 나란히 들면 두 벌을 손으로 맞춰야 해서 한쪽만 고쳤을 때 조용히 어긋난다.
  // 그래서 블록마다 무슨 역할인지 한 줄 캡션만 곁들이고 프롬프트 본문을 옮겨 적지 않는다.
  import { untrack } from 'svelte';
  import Spinner from '$lib/shared/ui/Spinner.svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { marketingChannelsService as svc } from '$lib/features/marketing-channels/services/marketingChannels.service';
  import CenterModal from '$lib/shared/ui/CenterModal.svelte';
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';

  interface Props {
    open?: boolean;
    channelId?: number | null;
    // 이 워크스페이스의 도구 버전: 지침은 버전별로 저장된다(그 버전 프롬프트 구조를 전제한다)
    version: VersionMode;
  }
  let { open = $bindable(false), channelId = null, version }: Props = $props();

  const queryClient = useQueryClient();
  const promptQuery = createQuery(() => svc.planPromptQueryOptions(version, channelId));
  const saveMutation = createMutation(() =>
    svc.setPlanPromptMutationOptions(queryClient, version),
  );

  // 편집 중인 지침(중간 부분). 모달을 열 때 서버값으로 초기화, 닫을 때 리셋
  let draft = $state<string | null>(null);
  $effect(() => {
    const data = promptQuery.data;
    const isOpen = open;
    untrack(() => {
      if (isOpen && data && draft === null) draft = data.instructions;
      if (!isOpen && draft !== null) draft = null;
    });
  });

  const view = $derived(promptQuery.data ?? null);
  const dirty = $derived(view != null && draft != null && draft !== view.instructions);
  const isDefault = $derived(view != null && (draft ?? '') === view.defaultInstructions);

  function resetToDefault(): void {
    if (view) draft = view.defaultInstructions;
  }
  function save(): void {
    if (channelId == null || draft == null) return;
    saveMutation.mutate({ channelId, instructions: draft });
  }
</script>

<CenterModal bind:open title="기획서 생성 프롬프트" size="xl" closeMode="back">
  {#if promptQuery.isPending}
    <p class="rounded-lg border border-dashed border-line px-3 py-10 text-center text-sm text-fg-subtle">
      불러오는 중…
    </p>
  {:else if promptQuery.isError}
    <p
      class="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-10 text-center text-sm text-danger-fg"
      role="alert"
    >
      프롬프트를 불러오지 못했습니다.
      <button
        type="button"
        onclick={() => promptQuery.refetch()}
        class="rounded-md px-2 py-0.5 text-fg underline decoration-line underline-offset-2 transition hover:decoration-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
      >
        다시 시도
      </button>
    </p>
  {:else if view}
    <div class="flex flex-col gap-3">
      <p class="text-xs leading-relaxed text-fg-subtle">
        기획서 생성에 쓰이는 프롬프트입니다. 가운데 <span class="font-medium text-fg">지침</span>만 수정할 수 있고,
        앞뒤(역할/출력 형식)는 출력이 깨지지 않도록 고정입니다. 저장하면 이 채널의 다음 생성부터 적용됩니다.
        <br />
        프롬프트는 <span class="font-medium text-fg">AI 와 주고받는 내부 언어라 영어</span>입니다. 기획안 제목,
        자막, 나레이션 같은 결과물은 그대로 한국어로 나옵니다.
      </p>

      <!-- 고정 앞부분 -->
      <section class="flex flex-col gap-1">
        <span class="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">고정 (앞)</span>
        <span class="text-[11px] leading-relaxed text-fg-subtle">
          AI 에게 주는 역할과 과제입니다. 생성할 개수는 만들 때 고른 값이 여기 뒤에 자동으로 붙습니다.
        </span>
        <pre class="max-h-24 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-fg-subtle">{view.header}</pre>
      </section>

      <!-- 고정: 이미지 안전 제약. 채널이 고른 이미지 모델에 따라 붙고, 해당 없으면 아예 표시하지 않는다.
           실제 조립 순서(고정 앞 → 안전 제약 → 지침 → 고정 뒤)와 같은 자리에 둔다. -->
      {#if view.imageSafetyDirective}
        <section class="flex flex-col gap-1">
          <span class="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
            고정 (이미지 안전 제약)
          </span>
          <span class="text-[11px] leading-relaxed text-fg-subtle">
            선택한 이미지 모델(OpenAI)이 영유아 신체를 묘사하는 요청을 거부해서, 그런 씬을 애초에 만들지 않도록
            자동으로 붙습니다. 자체 이미지 모델(FLUX)로 바꾸면 이 제약은 빠집니다.
          </span>
          <pre class="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-fg-subtle">{view.imageSafetyDirective}</pre>
        </section>
      {/if}

      <!-- 편집 가능한 중간 지침 -->
      <section class="flex flex-col gap-1">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-medium uppercase tracking-wide text-fg">편집 가능 (지침)</span>
            <!-- 권고이지 강제는 아니다. 한국어로 써도 LLM 은 읽는다(이미지 모델과 달리). 다만 프롬프트
                 나머지가 영어라 영어로 쓰는 편이 일관되고 정확하다. -->
            <span
              class="rounded-full border border-line px-1.5 py-px text-[10px] font-medium text-fg-subtle"
            >
              영어 권고
            </span>
          </div>
          <button
            type="button"
            onclick={resetToDefault}
            disabled={isDefault}
            class="rounded-md px-2 py-0.5 text-xs text-fg-subtle transition hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            기본값으로 되돌리기
          </button>
        </div>
        <span class="text-[11px] leading-relaxed text-fg-subtle">
          창작 방향(무엇을 중심으로, 어떤 톤으로 만들지)입니다. 프롬프트의 나머지가 영어라 영어로 쓰는 편이
          정확합니다. 한국어로 써도 동작은 합니다.
        </span>
        <textarea
          bind:value={draft}
          spellcheck="false"
          rows="12"
          class="w-full resize-y rounded-lg border border-line bg-elevated px-3 py-2 font-mono text-xs leading-relaxed text-fg focus:border-fg/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/20"
        ></textarea>
      </section>

      <!-- 고정 뒷부분(JSON 스키마) -->
      <section class="flex flex-col gap-1">
        <span class="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">고정 (뒤: 출력 형식/스키마)</span>
        <span class="text-[11px] leading-relaxed text-fg-subtle">
          결과를 읽어들이는 형식 계약이라 고정입니다. 필드별 언어도 여기서 정합니다. 제목, 자막, 나레이션,
          모든 값은 한국어로 나옵니다. 필드명은 결과를 읽어 들이는 이름이라 그대로 둡니다.
        </span>
        <pre class="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-fg-subtle">{view.footer}</pre>
      </section>

      {#if saveMutation.isError}
        <p class="text-xs text-danger-fg" role="alert">저장에 실패했습니다. 다시 시도해주세요.</p>
      {/if}
    </div>
  {/if}

  {#snippet footer()}
    <div class="flex items-center justify-end gap-2">
      {#if saveMutation.isSuccess && !dirty}
        <span class="mr-auto text-xs text-fg-subtle">저장됨</span>
      {/if}
      <button
        type="button"
        onclick={() => (open = false)}
        class="rounded-full px-4 py-2 text-sm font-medium text-fg-subtle transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
      >
        닫기
      </button>
      <button
        type="button"
        onclick={save}
        disabled={!dirty || saveMutation.isPending || channelId == null}
        class="flex items-center justify-center gap-2 rounded-full bg-fg px-5 py-2 text-sm font-medium text-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:opacity-100"
      >
        {#if saveMutation.isPending}
          <Spinner class="h-3.5 w-3.5" />
        {/if}
        저장
      </button>
    </div>
  {/snippet}
</CenterModal>
