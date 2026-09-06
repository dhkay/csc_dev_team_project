<script lang="ts">
  // 영상 카드 그리드: 원천 영상 / 최종 영상 / 보관물이 같은 형태로 선다(VideoCard). 세 자리가 같은
  //   컴포넌트를 쓰는 이유는 카드가 하는 일이 같아서다: '만드는 중'(렌더링)과 '완성'을 섹션으로 나눠 보여준다.
  //   렌더 중 프로젝트가 있으면 페이지가 목록을 폴링(videoProjectsQueryOptions.refetchInterval)해 자동 갱신
  //   카드 비율은 그 카드 행에 굳은 화면비를 따른다(버전마다 다르고, 옛 영상은 옛 모양이다). 완성은 <video> 인라인 재생, 렌더중/실패는 썸네일 위 오버레이
  //   selectable 이면 '완성' 카드만 우상단 선택 체크박스(빈 토글): 만드는 중(렌더링)은 선택 불가. 선택 → 하단 바에서 세트 적용/삭제
  //   만든 사람 배지는 owner 를 준 화면에만 붙는다(보관함). 워크스페이스는 전부 자기 것이라 붙이지 않는다.
  //   (같은 이름이 카드마다 반복되면 정보가 아니라 소음이다)
  import { type VideoCard, isRenderingStatus } from '$lib/features/marketing-channels/types';
  import CenterModal from '$lib/shared/ui/CenterModal.svelte';
  import Spinner from '$lib/shared/ui/Spinner.svelte';
  import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';
  import { downloadUrlAsFile } from '$lib/shared/lib/utils/downloadFile';
  import { storedAspectCss } from '../marketingAspect';
  import { formatAiModelLine } from '../aiModelOptions';
  import SelectToggle from './SelectToggle.svelte';
  import InfoPopover from './InfoPopover.svelte';

  interface Props {
    // 그릴 카드. 비어 있으면 아무것도 그리지 않는다.
    //
    // 빈 상태는 호출부의 것이다: 무엇이 없는지도, 그래서 무엇을 하면 되는지도 자리마다 다르다.
    // (기획안에서 만들라 / 결과 확인에서 저장하라 / 워크스페이스에서 보내라)
    // 이 컴포넌트가 기본 문구를 가지면 그 문구가 맞는 자리는 셋 중 하나뿐이라 나머지 둘이 각자
    // 앞에서 갈라 주게 된다.
    projects: readonly VideoCard[];
    // 우상단 선택 체크박스(빈 토글) 노출: '완성' 카드에만. 선택 → 하단 바에서 세트 적용/삭제 등
    selectable?: boolean;
    // 렌더 중(만드는 중) 카드도 선택 가능: 삭제 모드에서 진행 중인 것을 지울 때. 기본 false(완성만)
    allowRenderingSelect?: boolean;
    // 선택된 프로젝트 id(다중)
    selectedIds?: number[];
    // 선택 토글
    onToggleSelect?: (id: number) => void;
    // 다시 만들기: 저장된 조합 스펙으로 재렌더. 없으면 버튼을 숨긴다(보관함은 완성본 보존이 목적)
    onRerender?: (id: number) => void;
    // 이 카드의 `thumbnailUrl` 이 사람이 만든 대표 썸네일인가(자동으로 뽑힌 첫 씬 이미지가 아니라)
    //
    // 이 그리드는 두 종류의 그림을 그린다. 하나는 배포용 썸네일(사람이 프레임을 고르고 문구를 얹은
    // 것)이고 다른 하나는 첫 씬 이미지다. 어느 쪽인지에 따라 두 가지가 갈린다.
    //
    //   1. 따로 열어 보는 버튼: 사람이 만든 그림만 크게 보고 받아 갈 대상이다. 첫 씬 이미지는
    //      카드의 자리표시에 가까워 "썸네일" 이라는 이름이 사실이 아니다.
    //   2. 완성본 영상의 poster: 사람이 만든 그림은 얹지 않는다. 얹으면 그 그림이 영상의 첫
    //      화면처럼 보여 영상에 들어간 것으로 읽힌다. 실제로는 별개 파일이고 배포처에 올릴 때만
    //      쓰인다. 첫 씬 이미지는 영상에서 나온 한 컷이라 그대로 poster 로 남는다.
    //
    // 그래서 이름이 두 동작을 함께 가리킨다. 판정 근거는 호출부에 있다(그 버전이 씬 이미지를 만드는가)
    thumbnailPreview?: boolean;
    // 만든 사람 표기: id → `{ name, email }`. 주면 카드에 배지가 붙는다(안 주면 안 붙는다)
    //
    // 이름을 카드 데이터에 싣지 않고 조회 함수를 받는 이유: 이름은 표시 시점에 조인하는 값이고
    // (roster.ts 참고) 그리드는 어느 명부를 쓸지 몰라도 된다. 조회는 호출부가 한 번 만든 Map 을 탄다.
    //
    // 카드가 아니라 id 를 받는다(onToggleSelect 와 같은 관용): 그리드는 VideoCard 만 알고 호출부는
    // 더 넓은 타입을 들고 있어, 카드를 넘기면 좁은 타입을 요구하는 콜백이 타입에 맞지 않는다.
    ownerOf?: (id: number) => { name: string; email: string | null } | null;
    // 이 카드를 고를 수 있는가(선택 토글 노출 여부). 안 주면 `selectable` 만 본다.
    //
    // 쓰는 곳: 공용 보관함의 삭제 모드. 남이 만든 것은 지울 수 없으므로 애초에 고르지 못하게 한다.
    // (서버가 막는 방식이 "조용히 아무 일도 안 일어남" 이라, 고를 수 있게 두면 이유를 알 수 없다)
    canSelectItem?: (id: number) => boolean;
  }
  let {
    projects,
    selectable = false,
    allowRenderingSelect = false,
    selectedIds = [],
    onToggleSelect,
    onRerender,
    thumbnailPreview = false,
    ownerOf,
    canSelectItem,
  }: Props = $props();

  /**
   * 지금 크게 보고 있는 썸네일. 카드 안에서 키우지 않고 창으로 여는 이유: 카드 자리는 영상의 것이고
   * (완성본이 거기서 재생된다) 썸네일은 배포처에 올릴 그림이라 원래 크기로 확인할 대상이다.
   */
  let preview = $state<VideoCard | null>(null);
  let previewOpen = $state(false);
  let downloading = $state(false);

  function openPreview(card: VideoCard): void {
    preview = card;
    previewOpen = true;
  }

  /**
   * 썸네일 파일로 받기
   *
   * `<a download>` 로는 안 된다. 결과물이 다른 오리진(file-upload)에 있어 그 속성이 무시되고 이미지가
   * 새 탭에서 열릴 뿐이다. 그 우회는 downloadUrlAsFile 이 갖고 있다(영상 다운로드와 같은 이유)
   */
  async function downloadThumbnail(card: VideoCard): Promise<void> {
    if (!card.thumbnailUrl) return;
    downloading = true;
    try {
      await downloadUrlAsFile(card.thumbnailUrl, `${card.title || '썸네일'} 썸네일`);
    } catch {
      toastStore.error('썸네일을 내려받지 못했습니다', '잠시 후 다시 시도하세요.', {
        key: 'final-thumbnail-download-failed',
      });
    } finally {
      downloading = false;
    }
  }

  // 되돌려진 작업(CANCELLED/FAILED)은 페이지가 목록에서 걷어내므로 카드로 오지 않는다.
  //   (visibleRenders + 전역 알림). 라벨은 그래도 채워 둔다. 어휘가 늘 때 컴파일이 알려주는 자리이고,
  //   혹시 다른 경로로 들어와도 빈칸이 아니라 사람 말이 보이게 한다.
  const STATUS_LABEL: Record<VideoCard['renderStatus'], string> = {
    PENDING: '대기 중',
    RENDERING: '영상 만드는 중',
    STALLED: '렌더 지연',
    COMPLETED: '완성',
    CANCELLED: '취소(생성 불가)',
    FAILED: '실패',
  };

  const isRendering = (p: VideoCard): boolean => isRenderingStatus(p.renderStatus);
  const isStalled = (p: VideoCard): boolean => p.renderStatus === 'STALLED';

  // 만드는 중 / 완성 두 묶음. 둘 다 비면 이 컴포넌트는 아무것도 그리지 않는다(빈 상태는 호출부의 것)
  const inProgress = $derived(projects.filter((p) => isRendering(p)));
  const done = $derived(projects.filter((p) => !isRendering(p)));
</script>

<!-- 상태 그룹 헤더: 점 색으로 상태 구분(만드는 중=amber, 완성=emerald) -->
{#snippet groupHeader(label: string, count: number, dot: string)}
  <div class="mb-2 flex items-center gap-1.5 text-xs font-medium">
    <span class="inline-block h-1.5 w-1.5 shrink-0 rounded-full {dot}"></span>
    <span class="text-fg">{label}</span>
    <span class="tabular-nums text-fg-subtle">{count}</span>
  </div>
{/snippet}

<!-- 카드 하나: 만드는 중/완성 그룹이 공유. 토글은 selectable 이고 렌더링이 아닐 때만 -->
{#snippet card(p: VideoCard)}
  {@const selected = selectedIds.includes(p.id)}
  {@const canSelect = selectable && (canSelectItem?.(p.id) ?? true)}
  {@const canPreview = thumbnailPreview && !!p.thumbnailUrl}
  <div class="relative flex flex-col gap-1.5">
    <!-- 생성 정보(i): 원천 영상(videoModel 있음)의 완성 카드만
         InfoPopover 가 스스로 우상단(토글 왼쪽)에 배치. 카드 루트가 relative + overflow 밖이라 팝오버가 안 잘린다.
         만드는 중(대기/렌더/지연)에는 숨긴다. 지금 알아야 할 건 진행 상황이고, 그건 썸네일 위 오버레이가 말한다.
         삭제 모드(allowRenderingSelect)에선 우상단을 선택 토글에 양보한다(삭제 선택에 집중) -->
    {#if p.videoModel && !isRendering(p) && !allowRenderingSelect}
      <InfoPopover
        ariaLabel={`${p.title} 생성 정보`}
        items={[
          { label: '영상 모델', value: formatAiModelLine('video', p.videoModel) },
          {
            label: '음성(TTS)',
            value: p.ttsModel
              ? formatAiModelLine('tts', p.ttsModel) + (p.ttsVoice ? ` (${p.ttsVoice})` : '')
              : '미지정',
          },
        ]}
      />
    {/if}
    <div
      style="aspect-ratio: {storedAspectCss(p.aspectRatio)}"
      class="relative w-full overflow-hidden rounded-lg border bg-surface transition {selected
        ? 'border-fg ring-2 ring-fg'
        : 'border-line'}"
    >
      {#if p.renderStatus === 'COMPLETED' && p.resultUrl}
        <!--
          완성본은 영상 그대로 보여준다.
          따로 만든 썸네일은 poster 로 얹지 않는다(thumbnailPreview). 얹으면 그 그림이 영상의 첫
            화면처럼 보여, 영상에 들어간 것으로 읽힌다. 실제로는 별개 파일이고 배포처에 올릴 때만
            쓰인다. 그 그림은 아래 '썸네일' 로 따로 열어 본다.
          첫 씬 이미지(그 그림이 썸네일이 아닌 버전)는 영상에서 나온 한 컷이라 poster 로 남는다.
        -->
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          class="h-full w-full bg-black object-contain"
          src={p.resultUrl}
          poster={thumbnailPreview ? undefined : (p.thumbnailUrl ?? undefined)}
          controls
          preload="metadata"
        ></video>
      {:else}
        {#if p.thumbnailUrl && !thumbnailPreview}
          <img
            src={p.thumbnailUrl}
            alt={p.title}
            class="h-full w-full object-cover {isRendering(p) ? 'opacity-40' : ''}"
          />
        {/if}
        <!-- 썸네일 없으면 컨테이너 bg-surface 그대로(빈 배경). 상태는 아래 오버레이가 알린다. '이미지 없음' 문구 불필요 -->
        <!-- 상태 오버레이: 정체(경고) / 렌더 중(스피너) / 실패(사유) -->
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center">
          {#if isStalled(p)}
            <!-- 정체: 소비 워커 없음. 스피너 대신 경고. 계속 폴링 중이라 워커가 돌아오면 자동 재개된다. -->
            <svg
              class="h-6 w-6 text-amber-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            <span class="text-[11px] font-medium text-amber-500">{STATUS_LABEL.STALLED}</span>
            <span class="line-clamp-3 text-[10px] text-fg-subtle">
              렌더 워커가 실행 중이 아닐 수 있어요. 잠시 후 자동 재개됩니다.
            </span>
          {:else if isRendering(p)}
            <Spinner class="h-6 w-6 text-fg" />
            <span class="text-[11px] font-medium text-fg">{STATUS_LABEL[p.renderStatus]}…</span>
            {#if p.progress != null}
              <span class="text-[10px] font-semibold text-fg-subtle">{p.progress}%</span>
            {/if}
          {:else}
            <span class="text-[11px] font-semibold text-red-400">{STATUS_LABEL.FAILED}</span>
            {#if p.error}
              <span class="line-clamp-3 text-[10px] text-fg-subtle">{p.error}</span>
            {/if}
          {/if}
        </div>
      {/if}
      {#if selected}
        <!-- 선택 딤: 재생/컨트롤을 막지 않게 pointer-events-none. -->
        <div class="pointer-events-none absolute inset-0 bg-fg/25"></div>
      {/if}
      {#if canSelect && (allowRenderingSelect || !isRendering(p))}
        <SelectToggle
          checked={selected}
          onToggle={() => onToggleSelect?.(p.id)}
          label={`${p.title} 선택`}
        />
      {/if}
    </div>

    <span class="truncate text-xs font-medium text-fg">{p.title}</span>

    <!-- 만든 사람: 공용 보관함에서 "이건 누구 것인가" 를 말한다. 좁은 자리라 이름만 보이고
         이메일은 title 툴팁으로 붙인다(동명이인을 갈라 주는 값. multi-tenancy.md 의 좁은 자리 규칙) -->
    {#if ownerOf}
      {@const owner = ownerOf(p.id)}
      {#if owner}
        <span
          class="truncate text-[11px] text-fg-subtle"
          title={owner.email ? `${owner.name} (${owner.email})` : owner.name}
        >
          {owner.name}
        </span>
      {/if}
    {/if}

    <!-- 카드 하단 보조 동작: 썸네일 따로 보기 + 다시 만들기(핸들러가 있을 때만)
         선택/삭제는 우상단 토글 + 하단 바로 처리한다.
         썸네일 보기는 렌더 중에도 둔다: 그 그림은 렌더와 무관하게 이미 있다(만드는 중인 카드에
         썸네일이 붙는 경우는 지금 없지만, 있으면 그때도 볼 수 있는 것이 맞다) -->
    {#if canPreview || (!isRendering(p) && onRerender)}
      <div class="flex items-center gap-2 text-[11px]">
        {#if canPreview}
          <button
            type="button"
            onclick={() => openPreview(p)}
            class="text-fg-subtle transition hover:text-fg focus:outline-none"
          >
            썸네일
          </button>
        {/if}
        {#if !isRendering(p) && onRerender}
          <button
            type="button"
            onclick={() => onRerender?.(p.id)}
            class="text-fg-subtle transition hover:text-fg focus:outline-none"
          >
            다시 만들기
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

<div class="flex flex-col gap-5">
  {#if inProgress.length > 0}
    <section>
      {@render groupHeader('만드는 중', inProgress.length, 'bg-amber-500')}
      <div class="grid grid-cols-[repeat(auto-fill,11rem)] content-start justify-start gap-4">
        {#each inProgress as p (p.id)}
          {@render card(p)}
        {/each}
      </div>
    </section>
  {/if}
  {#if done.length > 0}
    <section>
      {@render groupHeader('완성', done.length, 'bg-emerald-500')}
      <div class="grid grid-cols-[repeat(auto-fill,11rem)] content-start justify-start gap-4">
        {#each done as p (p.id)}
          {@render card(p)}
        {/each}
      </div>
    </section>
  {/if}
</div>

<!--
  썸네일 따로 보기. 카드에서는 영상이 자리를 쓰므로 그림은 원래 크기로 볼 자리가 따로 필요하다.
  창 하나를 그리드가 들고 어느 카드의 것인지만 바꾼다(카드마다 창을 두면 목록 수만큼 마운트된다)
-->
{#if preview}
  {@const shown = preview}
  <CenterModal bind:open={previewOpen} title={shown.title} onClose={() => (preview = null)}>
    <div class="flex h-full flex-col items-center justify-center gap-3">
      {#if shown.thumbnailUrl}
        <img
          src={shown.thumbnailUrl}
          alt={`${shown.title} 썸네일`}
          class="max-h-full min-h-0 w-auto max-w-full rounded-lg border border-line object-contain"
        />
      {/if}
    </div>
    {#snippet footer()}
      <div class="flex items-center justify-between gap-3">
        <p class="text-[11px] text-fg-subtle">
          영상과 별개 파일입니다. 배포처에 올릴 대표 이미지로 그대로 쓸 수 있습니다.
        </p>
        <button
          type="button"
          onclick={() => void downloadThumbnail(shown)}
          disabled={downloading}
          class="shrink-0 rounded-full bg-fg px-4 py-1.5 text-xs font-medium text-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {downloading ? '받는 중...' : '다운로드'}
        </button>
      </div>
    {/snippet}
  </CenterModal>
{/if}
