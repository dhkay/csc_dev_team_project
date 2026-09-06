<script lang="ts">
  // 포커스 키워드 검색 화면. 생성 모달의 키워드 검색이 여는 같은 모달 안의 다른 레이아웃이고,
  // 상단 back 으로 그 화면으로 돌아간다.
  //
  // 흐름: 주제 한 줄 입력 → 검색(수집 + 보완) → 최대 5개 선택 → 선택 완료
  //
  // 검색은 서버에서 데이터 수집이 먼저라 몇 초 걸리고, 다 모인 뒤에 한 번에 그린다. 부분 결과를
  // 먼저 그리면 고르는 도중에 목록이 바뀐다.
  //
  // 후보는 입력한 주제를 품은 롱테일만 나온다. 수집분이 모자라면 서버가 같은 형식으로 채워 15개를
  // 맞추고, 두 갈래는 행의 라벨로 구분된다.
  //
  // 저장하지 않는다. 고른 키워드는 이번 생성에만 쓰이고 요청에 실려 간다.
  import { createMutation } from '@tanstack/svelte-query';
  import { marketingChannelsService as svc } from '$lib/features/marketing-channels/services/marketingChannels.service';
  import type { FocusKeywordCandidate } from '$lib/features/marketing-channels/types';
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import {
    FOCUS_KEYWORD_MAX,
    addManualKeyword,
    isSelectionFull,
    toggleFocusKeyword,
    mergeFocusCandidates,
    renameFocusCandidate,
    removeFocusCandidate,
    type AddFailure,
    type RenameFailure,
  } from '../focusKeyword';
  import FocusKeywordRow from './FocusKeywordRow.svelte';

  interface Props {
    // 이 화면이 다루는 채널(후보 검색이 채널 맥락과 모델을 쓴다)
    channelId: number | null;
    // 고른 키워드(bindable). 이 화면이 아니라 위저드가 소유한다.
    // '선택 완료' 버튼이 모달 하단(footer)에 있고, 그 버튼은 이 화면 밖이라 개수를 알아야 한다.
    selected?: string[];
    // 이 워크스페이스의 도구 버전(주소의 축). 설정 슬롯과 프롬프트 조립이 이 값으로 갈린다.
    version: VersionMode;
    // 앞 화면으로 돌아가기(고른 것은 확정하지 않는다)
    onBack: () => void;
  }
  let { channelId, version, selected = $bindable([]), onBack }: Props = $props();

  const suggestMut = createMutation(() => svc.suggestKeywordsMutationOptions(version));

  let seed = $state('');
  /** 화면에 보여줄 후보 목록(화면을 벗어나면 사라진다). 출처 라벨을 달고 온다. */
  let candidates = $state<FocusKeywordCandidate[]>([]);
  // 이미 고른 키워드는 목록에 남겨 둔다(진입할 때 한 번)
  //   출처를 모르는 상태로 들어오므로 '직접 입력' 으로 둔다. 수집값이라고 단정하면 라벨이 거짓이 된다.
  $effect(() => {
    if (selected.length === 0 || candidates.length > 0) return;
    candidates = selected.map((keyword) => ({ keyword, origin: 'edited' as const }));
  });

  const canGenerate = $derived(seed.trim().length > 0 && !suggestMut.isPending);
  const isFull = $derived(isSelectionFull(selected));
  const actionError = $derived(
    suggestMut.isError
      ? suggestMut.error instanceof Error
        ? suggestMut.error.message
        : '키워드 후보를 만들지 못했습니다.'
      : null,
  );

  function generate(): void {
    if (channelId === null || !canGenerate) return;
    suggestMut.mutate(
      { channelId, seed: seed.trim() },
      {
        // 이미 고른 것은 목록 위쪽에 남는다(규칙은 focusKeyword 모듈이 소유)
        onSuccess: (list) => (candidates = mergeFocusCandidates(candidates, selected, list)),
      },
    );
  }

  function toggle(value: string): void {
    selected = toggleFocusKeyword(selected, value);
  }

  /** 직접 추가 입력. 검색과 별개다(이건 후보를 찾는 게 아니라 이미 아는 말을 넣는 것이다) */
  let manual = $state('');
  /** 직접 추가 실패 문구: 규칙은 모듈이 판정하고, 무엇이라고 알릴지는 화면이 정한다. */
  const ADD_MESSAGE: Record<AddFailure, string> = {
    empty: '키워드를 입력하세요.',
    selected: '이미 고른 키워드입니다.',
    full: `최대 ${FOCUS_KEYWORD_MAX}개까지 고를 수 있습니다. 하나를 해제한 뒤 추가하세요.`,
  };

  /** 직접 추가: 목록에 넣고 바로 고른다(손으로 친 말은 곧 쓰겠다는 뜻이다) */
  function addManual(): void {
    const result = addManualKeyword({ candidates, selected }, manual);
    if (!result.ok) {
      manualError = ADD_MESSAGE[result.reason];
      return;
    }
    candidates = result.list.candidates;
    selected = result.list.selected;
    manual = '';
    manualError = null;
  }
  let manualError = $state<string | null>(null);

  /** 수정 실패 문구: 규칙은 모듈이 판정하고, 무엇이라고 알릴지는 화면이 정한다. */
  const RENAME_MESSAGE: Record<RenameFailure, string> = {
    empty: '키워드를 입력하세요.',
    duplicate: '이미 목록에 있는 키워드입니다.',
  };

  /** 후보 수정: 성공하면 null, 실패하면 그 줄에 띄울 문구를 돌려준다. */
  function rename(from: string, to: string): string | null {
    const result = renameFocusCandidate({ candidates, selected }, from, to);
    if (!result.ok) return RENAME_MESSAGE[result.reason];
    candidates = result.list.candidates;
    selected = result.list.selected;
    return null;
  }

  function remove(value: string): void {
    const next = removeFocusCandidate({ candidates, selected }, value);
    candidates = next.candidates;
    selected = next.selected;
  }

</script>

<div class="flex flex-col gap-3">
  <!-- 상단 back: 앞 화면으로 돌아간다(설정 섹션 상세와 같은 관용)
       모달 제목이 버전마다 다르므로(v1.5 '영상 생성' / v1.0 '기획서 생성') 이 라벨에 그 이름을 박지 않는다. -->
  <button
    type="button"
    onclick={onBack}
    class="flex items-center gap-1 border-b border-line py-2.5 text-left transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fg/25"
    aria-label="돌아가기"
  >
    <svg
      class="h-5 w-5 shrink-0 text-fg-subtle"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
    <span class="text-sm font-medium text-fg">포커스 키워드 검색</span>
  </button>

  <!-- 상한 안내: 고르는 내내 보이도록 목록 위에 고정한다. -->
  <p class="rounded-lg bg-accent-bg px-3 py-2 text-center text-sm font-medium text-accent-fg">
    포커스 키워드는 최대 {FOCUS_KEYWORD_MAX}개까지 선택 가능합니다
  </p>

  <!-- 주제 한 줄 → 후보 검색 -->
  <div class="flex gap-2">
    <input
      type="text"
      value={seed}
      oninput={(e) => (seed = e.currentTarget.value)}
      onkeydown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          generate();
        }
      }}
      maxlength={200}
      placeholder="주제를 입력하세요 (예: 아기 엉덩이 발진)"
      aria-label="키워드 주제"
      class="min-w-0 flex-1 rounded-lg border border-line bg-elevated px-3 py-1.5 text-sm text-fg placeholder:text-fg-subtle transition focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15"
    />
    <button
      type="button"
      onclick={generate}
      disabled={!canGenerate || channelId === null}
      class="shrink-0 rounded-lg bg-fg px-4 py-1.5 text-sm font-medium text-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:opacity-50"
    >
      {suggestMut.isPending ? '수집 중…' : '검색'}
    </button>
  </div>

  {#if actionError}
    <p class="text-xs text-danger-fg" role="alert">{actionError}</p>
  {/if}

  <!-- 직접 추가: 검색으로 안 나오는 말(사내 표현, 신제품명)을 작업자가 넣는다.
       넣는 즉시 고른 것으로 친다. 상한은 수집/생성/직접 입력을 가리지 않고 똑같이 적용된다. -->
  <div class="flex gap-2">
    <input
      type="text"
      value={manual}
      oninput={(e) => {
        manual = e.currentTarget.value;
        manualError = null;
      }}
      onkeydown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addManual();
        }
      }}
      maxlength={100}
      placeholder="찾는 키워드가 없으면 직접 입력하세요"
      aria-label="키워드 직접 입력"
      class="min-w-0 flex-1 rounded-lg border border-line bg-elevated px-3 py-1.5 text-sm text-fg placeholder:text-fg-subtle transition focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15"
    />
    <button
      type="button"
      onclick={addManual}
      disabled={manual.trim().length === 0}
      class="shrink-0 rounded-lg border border-line px-4 py-1.5 text-sm font-medium text-fg transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 disabled:opacity-50"
    >
      추가
    </button>
  </div>

  {#if manualError}
    <p class="text-xs text-danger-fg" role="alert">{manualError}</p>
  {/if}

  <!-- 후보 목록: 행마다 선택/해제 + 더보기(수정/삭제). 상한에 닿으면 새로 고르는 것만 잠긴다. -->
  {#if candidates.length === 0}
    <p class="rounded-lg border border-dashed border-line px-3 py-10 text-center text-sm text-fg-subtle">
      주제를 입력하고 '검색'을 누르면 그 주제를 포함한 더 긴 검색어를 검색량이 많은 순으로 보여줍니다.
    </p>
  {:else}
    <ul class="flex flex-col divide-y divide-line rounded-xl border border-line">
      {#each candidates as candidate (candidate.keyword)}
        <FocusKeywordRow
          {candidate}
          selected={selected.includes(candidate.keyword)}
          selectionFull={isFull}
          onToggle={() => toggle(candidate.keyword)}
          onRename={(next) => rename(candidate.keyword, next)}
          onRemove={() => remove(candidate.keyword)}
        />
      {/each}
    </ul>
  {/if}
</div>
