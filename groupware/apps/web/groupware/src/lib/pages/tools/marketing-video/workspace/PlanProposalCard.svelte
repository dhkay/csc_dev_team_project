<script lang="ts">
  // 기획안 1개: 아코디언 섹션. 헤더(순번 + 제목 + 요약) 클릭 시 단위별 구조를 펼친다.
  //  - 씬이 갖는 항목은 파이프라인마다 다르다(isSegmentFormat 이 값으로 가른다)
  //      씬 이미지 형식: 씬 이미지 + [Scene N] + 소스 방향 / 하단 자막 / 나레이션
  //      세그먼트 형식: [동영상 N] + 장면 구성 / 대화내용 / 나레이션(씬 이미지를 만들지 않는다)
  //  - 인포그래픽 씬은 이미지 슬롯 자체가 데이터로 렌더된 인포그래픽 이미지다(별도 텍스트 카드 없음)
  import type { PlanProposal, PlanScene, SceneImageState } from '$lib/features/marketing-channels/types';
  import { IMAGE_ACCEPT } from '$lib/shared/lib/image/imageFile';
  import Spinner from '$lib/shared/ui/Spinner.svelte';
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import { versionAspectCss } from '../marketingAspect';
  import { isSegmentFormat } from '../planSceneFormat';
  import CenterModal from '$lib/shared/ui/CenterModal.svelte';
  import AudioPlayer from '../shared/AudioPlayer.svelte';
  import { browser } from '$app/environment';
  import { frontClient } from '$lib/infrastructure/http/clientInstances';
  /** offsetSec 절대값 표시: 정수면 그대로, 소수면 소수 1자리 */
  const fmtOffset = (s: number): string => (Number.isInteger(s) ? `${s}` : s.toFixed(1));
  /** 큐 위치 라벨: 음수=전환 걸침, 0=컷 정확히, 양수=씬 안 */
  function sfxLabel(anchorScene: number, offset: number): string {
    if (offset < 0) return `씬 ${anchorScene} 전환 지점 (−${fmtOffset(-offset)}초)`;
    if (offset === 0) return `씬 ${anchorScene} 전환 지점`;
    return `씬 ${anchorScene} 시작 +${fmtOffset(offset)}초`;
  }

  interface Props {
    proposal: PlanProposal;
    // 이 기획안이 속한 버전. 씬 이미지 상자 비율이 여기서 나온다(그 버전이 만드는 그림의 모양)
    version: VersionMode;
    // 아코디언 순번(1-base): 헤더 배지
    order: number;
    // 씬 번호로 이미지 상태를 조회(부모 오케스트레이터가 채운다). 없으면 이미지 슬롯 미표시
    imageFor?: (sceneIndex: number) => SceneImageState | undefined;
    // 씬 이미지 다시 생성(선택 브리프로). 넘기면 씬마다 '다시 생성' 버튼 + 모달 재생성이 뜬다.
    // imagePrompt 를 주면 그 브리프로, 없으면 현재 브리프로 생성한다.
    onRetry?: (scene: PlanScene, imagePrompt?: string) => void;
    // 씬 브리프(영어 imagePrompt)만 저장(재생성 없이). 라이브=스토어 / 저장본=DB 반영
    onSaveBrief?: (scene: PlanScene, imagePrompt: string) => void;
    // 외부 이미지 가져오기: 작업자가 고른 파일을 넘긴다(검증/변환은 부모가 한다)
    onPickImage?: (scene: PlanScene, file: File) => void;
    // 씬의 편집된 브리프 조회(없으면 원본 scene.imagePrompt 를 쓴다)
    promptEditFor?: (sceneIndex: number) => string | undefined;
    // 기획안 삭제: 넘기면 상세(alwaysOpen) 헤더의 제목 우측 끝에 삭제 버튼이 뜬다.
    onDelete?: () => void;
    // 상세 뷰 모드: 아코디언 없이 씬을 항상 펼쳐 렌더(워크스페이스 상세)
    alwaysOpen?: boolean;
  }
  let {
    proposal,
    version,
    order,
    imageFor,
    onRetry,
    onSaveBrief,
    onPickImage,
    promptEditFor,
    onDelete,
    alwaysOpen = false,
  }: Props = $props();

  let open = $state(false);
  const expanded = $derived(alwaysOpen || open);

  // 오디오(bgm/효과음) 재생 URL: 클라이언트가 /files URL 을 만들 수 없어(서명 불가) BFF 로 서명 발급받는다.
  //   access-urls 라우트가 세션 조직 스코프로 서명(require_signed_download). uploadId → 서명 URL 맵
  //   발급 전/실패 시 빈 문자열(재생만 잠시 불가, 목록 렌더는 계속). proposal 오디오가 바뀌면 재발급
  let signedAudio = $state<Record<string, string>>({});
  $effect(() => {
    if (!browser) return;
    const ids = [
      proposal.bgm?.uploadId,
      ...proposal.scenes.flatMap((s) => (s.sfx ?? []).map((x) => x.uploadId)),
    ].filter((v): v is string => !!v);
    if (ids.length === 0) {
      signedAudio = {};
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await frontClient().POST<{ success: boolean; data?: { urls: Record<string, string> } }>(
          '/api/file/upload/access-urls',
          { ids },
        );
        if (!cancelled && res.data.success) signedAudio = res.data.data?.urls ?? {};
      } catch {
        /* 발급 실패: 재생 불가(미표시). 목록 렌더는 계속 */
      }
    })();
    return () => {
      cancelled = true;
    };
  });
  const audioUrl = (uploadId: string): string => signedAudio[uploadId] ?? '';

  // 효과음은 씬에 매인 게 아니라 기획안 전체의 타임라인 큐다. 씬별 sfx 를 하나의 목록으로 flatten 해
  // 앵커 씬 + offset 순으로 보여준다(씬 카드 밖). offset 부호로 전환 걸침을 표기한다.
  const sfxCues = $derived(
    proposal.scenes
      .flatMap((s) => (s.sfx ?? []).map((x) => ({ ...x, anchorScene: s.index })))
      .sort((a, b) => a.anchorScene - b.anchorScene || a.offsetSec - b.offsetSec),
  );

  // 씬 편집(다시 생성 / 외부 이미지 / 브리프)이 가능한가: 콜백이 하나라도 있으면
  const canEdit = $derived(!!onRetry || !!onSaveBrief || !!onPickImage);

  // 프롬프트 모달: 영어 브리프(imagePrompt)를 편집하고, 이 이미지를 만든 조립 프롬프트(참고)를 함께 본다.
  //   promptScene 이 열린 씬. draft = 편집 중 브리프(열 때 편집값 ?? 원본으로 초기화)
  let promptScene = $state<PlanScene | null>(null);
  let draftBrief = $state('');
  // 조립된 최종 프롬프트(백엔드 조립 결과): 참고용 읽기 전용. 프론트가 흉내내지 않는다(실물과 어긋나면 무의미)
  const assembledPrompt = $derived(promptScene ? (imageFor?.(promptScene.index)?.prompt ?? '') : '');
  function openPrompt(scene: PlanScene): void {
    draftBrief = promptEditFor?.(scene.index) ?? scene.imagePrompt ?? '';
    promptScene = scene;
  }
  const briefDirty = $derived(
    promptScene ? draftBrief !== (promptEditFor?.(promptScene.index) ?? promptScene.imagePrompt ?? '') : false,
  );

  // 숨은 파일 입력 1장을 씬들이 공유한다. 버튼이 대신 연다(파일 입력 자체는 스타일이 어렵고 접근성도 나쁘다)
  //   한 번에 한 피커만 열리므로 "어느 씬이 열었는지"만 기억하면 씬마다 input 을 둘 이유가 없다.
  let fileInput = $state<HTMLInputElement | undefined>();
  let pickingScene: PlanScene | null = null;
  function openPicker(scene: PlanScene): void {
    pickingScene = scene;
    fileInput?.click();
  }
  function handlePicked(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    const scene = pickingScene;
    pickingScene = null;
    // 같은 파일을 다시 골라도 change 가 뜨도록 값을 비운다.
    input.value = '';
    if (file && scene) onPickImage?.(scene, file);
  }
</script>

<div class="overflow-hidden rounded-xl border border-line bg-elevated">
  {#if alwaysOpen}
    <!-- 상세 헤더: 토글 없이 항상 펼침. 제목 우측 끝에 삭제 버튼(중첩 button 회피 위해 div 헤더) -->
    <div class="flex items-start gap-3 px-4 py-3">
      <span
        class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fg text-xs font-semibold text-surface"
      >
        {order}
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-sm font-semibold text-fg">{proposal.title}</span>
        {#if proposal.summary}
          <span class="mt-0.5 block text-xs leading-relaxed text-fg-subtle">{proposal.summary}</span>
        {/if}
      </span>
      {#if onDelete}
        <button
          type="button"
          onclick={() => onDelete?.()}
          class="mt-0.5 flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-fg-subtle transition hover:bg-hover hover:text-danger-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
        >
          <svg
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
          삭제하기
        </button>
      {/if}
    </div>
  {:else}
    <!-- 아코디언 헤더: 클릭하면 씬 구조 펼침 -->
    <button
      type="button"
      onclick={() => (open = !open)}
      aria-expanded={expanded}
      class="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fg/25"
    >
      <span
        class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fg text-xs font-semibold text-surface"
      >
        {order}
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-sm font-semibold text-fg">{proposal.title}</span>
        {#if proposal.summary}
          <span class="mt-0.5 block text-xs leading-relaxed text-fg-subtle">{proposal.summary}</span>
        {/if}
      </span>
      <svg
        class="mt-1 h-4 w-4 shrink-0 text-fg-subtle transition-transform {expanded ? 'rotate-90' : ''}"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  {/if}

  <!-- 씬 구조 -->
  {#if expanded}
    <div class="flex flex-col gap-4 border-t border-line px-4 py-3.5">
      <!-- 기획안 전체 BGM(AI 자동 선택): 표시 + 재생. 효과음과 동일하게 좌측정렬로 폭을 줄인다. -->
      {#if proposal.bgm}
        <div class="flex w-full max-w-[15rem] flex-col gap-1.5 rounded-lg border border-line bg-surface px-3 py-2">
          <div class="flex items-center gap-1.5">
            <svg class="h-3.5 w-3.5 shrink-0 text-fg-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
            <span class="shrink-0 text-xs font-semibold text-fg">BGM</span>
            <span class="min-w-0 flex-1 truncate text-xs text-fg-subtle" title={proposal.bgm.name}>{proposal.bgm.name}</span>
          </div>
          <AudioPlayer src={audioUrl(proposal.bgm.uploadId)} />
        </div>
      {/if}

      <!-- 효과음(AI 자동 선택): 씬에 매이지 않는 타임라인 큐. 씬 카드 밖 목록으로, 전환 걸침도 표기 -->
      {#if sfxCues.length > 0}
        <div class="flex flex-col gap-2 rounded-lg border border-line bg-surface px-3 py-2">
          <div class="flex items-center gap-1.5">
            <svg class="h-3.5 w-3.5 shrink-0 text-fg-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></svg>
            <span class="text-xs font-semibold text-fg">효과음</span>
            <span class="text-[11px] text-fg-subtle">{sfxCues.length}</span>
          </div>
          <ul class="flex flex-col gap-2">
            {#each sfxCues as cue, i (cue.uploadId + '-' + cue.anchorScene + '-' + i)}
              <!-- 효과음은 짧아 재생바를 좌측정렬로 짧게(BGM 과 달리 전체 폭 X) -->
              <li class="flex w-full max-w-[15rem] flex-col gap-1">
                <span class="text-xs text-fg">
                  {cue.name}
                  <span class="text-fg-subtle">,  {sfxLabel(cue.anchorScene, cue.offsetSec)}</span>
                </span>
                <AudioPlayer src={audioUrl(cue.uploadId)} />
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      {#each proposal.scenes as scene (scene.index)}
        <!-- 프롬프트: 편집 가능하면 항상 열 수 있고(브리프 편집), 아니면 조립 프롬프트가 있을 때만(읽기 전용) -->
        {@const scenePrompt = imageFor?.(scene.index)?.prompt}
        {@const hasPromptBtn = canEdit || !!scenePrompt}
        <div class="flex flex-col gap-1.5">
          <!-- 씬 머리: 번호 바로 옆에 액션(프롬프트, 다시 생성, 외부 이미지)이 나란히 -->
          <div class="flex items-center gap-1">
            <span class="text-xs font-semibold text-fg">
              {isSegmentFormat(scene) ? `동영상 ${scene.index}` : `Scene ${scene.index}`}
            </span>
            {#if hasPromptBtn}
              <div class="flex items-center gap-0.5">
                <!-- 프롬프트: 편집 가능하면 편집기, 아니면 조립 프롬프트 읽기 전용(모델 거친 이미지에만) -->
                <button
                  type="button"
                  onclick={() => openPrompt(scene)}
                  title={canEdit ? '이미지 설명 편집하고 다시 만들기' : '이 이미지에 쓴 설명 보기'}
                  aria-label={`씬 ${scene.index} 이미지 설명`}
                  class="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
                >
                  <svg
                    class="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
                    <path d="M14 3v5h5" />
                    <path d="M8 13h8M8 17h5" />
                  </svg>
                </button>
                {#if onRetry}
                  <button
                    type="button"
                    onclick={() => onRetry?.(scene)}
                    title="이미지 다시 만들기"
                    aria-label={`씬 ${scene.index} 이미지 다시 만들기`}
                    class="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
                  >
                    <svg
                      class="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                      <path d="M21 3v6h-6" />
                    </svg>
                  </button>
                {/if}
                {#if onPickImage}
                  <button
                    type="button"
                    onclick={() => openPicker(scene)}
                    title="외부 이미지 가져오기"
                    aria-label={`씬 ${scene.index} 외부 이미지 가져오기`}
                    class="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
                  >
                    <svg
                      class="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="m21 15-5-5L5 21" />
                    </svg>
                  </button>
                {/if}
              </div>
            {/if}
          </div>

          <!-- 씬 이미지 슬롯(세로 2:3): 생성 중/완료/실패. 부모 오케스트레이터가 상태를 채운다. -->
          {#if imageFor}
            {@const img = imageFor(scene.index)}
            <div
              style="aspect-ratio: {versionAspectCss(version)}"
              class="w-full max-w-[200px] overflow-hidden rounded-lg border border-line bg-surface"
            >
              {#if !img || img.status === 'loading'}
                <div class="flex h-full w-full items-center justify-center text-fg-subtle">
                  <Spinner class="h-5 w-5" />
                </div>
              {:else if img.status === 'done'}
                <img
                  src={img.dataUrl}
                  alt={`씬 ${scene.index} 이미지`}
                  class="h-full w-full object-cover"
                />
              {:else}
                <div class="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2 text-center text-fg-subtle">
                  <span class="text-xs font-medium text-danger-fg">이미지 만들기 실패</span>
                  {#if img.error}
                    <span class="line-clamp-3 text-[10px] leading-tight text-fg-subtle">{img.error}</span>
                  {/if}
                  {#if onRetry}
                    <button
                      type="button"
                      onclick={() => onRetry?.(scene)}
                      class="rounded-md border border-line px-2 py-0.5 text-xs text-fg transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
                    >
                      다시 만들기
                    </button>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}

          <!--
            씬이 갖는 항목은 파이프라인마다 다르다. 버전 prop 이 아니라 값의 유무로 가른다:
            조건이 버전 수만큼 늘지 않고, 어느 형식인지가 데이터 자체에 이미 적혀 있다.
            (렌더도 같은 근거를 쓴다: compose 가 씬 이미지 유무로 프롬프트의 뜻을 가른다.)
          -->
          <dl class="flex flex-col gap-1 text-sm">
            {#if isSegmentFormat(scene)}
              <div class="flex gap-2">
                <dt class="w-16 shrink-0 text-fg-subtle">장면 구성</dt>
                <dd class="min-w-0 flex-1 text-fg">{scene.sceneComposition}</dd>
              </div>
              <!-- 말은 둘 중 하나만 찬다(대화내용이면 화면 속 인물, 나레이션이면 화면 밖)
                   한쪽만 그리면 어느 쪽으로 만들어지는지 알 수 없고, 말이 없는 동영상도 정상이라
                   빈 칸 대신 '없음' 을 적는다. -->
              <div class="flex gap-2">
                <dt class="w-16 shrink-0 text-fg-subtle">대화내용</dt>
                <dd class="min-w-0 flex-1 text-fg">
                  {scene.dialogue?.trim() ? scene.dialogue : '없음'}
                </dd>
              </div>
              <div class="flex gap-2">
                <dt class="w-16 shrink-0 text-fg-subtle">나레이션</dt>
                <dd class="min-w-0 flex-1 text-fg">
                  {scene.narration?.trim() ? scene.narration : '없음'}
                </dd>
              </div>
            {:else}
              <div class="flex gap-2">
                <dt class="w-16 shrink-0 text-fg-subtle">소스 방향</dt>
                <dd class="min-w-0 flex-1 text-fg">{scene.sourceDirection}</dd>
              </div>
              <div class="flex gap-2">
                <dt class="w-16 shrink-0 text-fg-subtle">하단 자막</dt>
                <dd class="min-w-0 flex-1 text-fg">{scene.subtitle}</dd>
              </div>
              <div class="flex gap-2">
                <dt class="w-16 shrink-0 text-fg-subtle">나레이션</dt>
                <dd class="min-w-0 flex-1 text-fg">{scene.narration}</dd>
              </div>
            {/if}
          </dl>

        </div>
      {/each}
    </div>
  {/if}

  <!-- 씬들이 공유하는 숨은 파일 입력: 어느 씬이 열었는지는 pickingScene 이 기억한다. -->
  {#if onPickImage}
    <input
      bind:this={fileInput}
      type="file"
      accept={IMAGE_ACCEPT}
      onchange={handlePicked}
      class="hidden"
      tabindex="-1"
      aria-hidden="true"
    />
  {/if}
</div>

<!-- 프롬프트: 편집 가능하면 브리프(영어 imagePrompt) 편집기 + 재생성/외부, 아니면 조립 프롬프트 읽기 전용 -->
<CenterModal open={promptScene !== null} title={promptScene ? `Scene ${promptScene.index} 이미지 설명` : ''} onClose={() => (promptScene = null)}>
  {#if promptScene}
    <div class="flex flex-col gap-3">
      {#if canEdit}
        <!-- 편집 대상 = 씬의 영어 브리프. 표현 형식/무드/형식 규칙은 자동으로 붙으니 편집 대상이 아니다. -->
        <section class="flex flex-col gap-1">
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-medium uppercase tracking-wide text-fg">이미지 설명 (영어)</span>
            <span class="rounded-full border border-line px-1.5 py-px text-[10px] font-medium text-fg-subtle">영어 권고</span>
          </div>
          <span class="text-[11px] leading-relaxed text-fg-subtle">
            이 컷에 무엇을 담을지 이미지 AI 에게 알려주는 영어 설명입니다. 고쳐서 <span class="font-medium text-fg">이미지를 다시 만들</span> 수 있습니다.
            표현 형식과 무드는 브랜드/컨셉에서 자동으로 붙습니다. (외부 이미지 교체는 씬 위쪽 버튼으로.)
          </span>
          <textarea
            bind:value={draftBrief}
            spellcheck="false"
            rows="5"
            class="w-full resize-y rounded-lg border border-line bg-elevated px-3 py-2 font-mono text-xs leading-relaxed text-fg focus:border-fg/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/20"
          ></textarea>
          <div class="flex flex-wrap items-center gap-2 pt-0.5">
            {#if onRetry}
              <button
                type="button"
                onclick={() => onRetry?.(promptScene!, draftBrief)}
                class="rounded-full bg-fg px-4 py-1.5 text-xs font-medium text-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30"
              >
                이 설명으로 다시 만들기
              </button>
            {/if}
            {#if onSaveBrief}
              <button
                type="button"
                onclick={() => onSaveBrief?.(promptScene!, draftBrief)}
                disabled={!briefDirty}
                class="rounded-full border border-line px-4 py-1.5 text-xs font-medium text-fg transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                설명만 저장
              </button>
            {/if}
          </div>
        </section>
      {/if}

      <!-- 조립된 최종 프롬프트: 참고용(읽기 전용). 모델을 거친 이미지에만 있다. -->
      {#if assembledPrompt}
        <section class="flex flex-col gap-1">
          <span class="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">AI 에 실제로 보낸 전체 내용 (참고용)</span>
          <span class="text-[11px] leading-relaxed text-fg-subtle">
            표현 형식과 무드, 형식 규칙까지 합쳐 이미지 AI 에 실제로 보낸 내용입니다. 여기는 못 고치고, 위 이미지 설명을 고쳐 다시 만듭니다.
          </span>
          <pre class="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-fg-subtle">{assembledPrompt}</pre>
        </section>
      {/if}
    </div>
  {/if}
</CenterModal>
