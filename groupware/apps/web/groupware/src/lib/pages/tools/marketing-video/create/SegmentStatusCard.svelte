<script lang="ts">
  // 세그먼트(동영상) 하나의 상태 카드. 진행 화면의 격자를 채운다.
  //
  // 상태 넷이 서로 다른 모양을 갖는다. 배지 색만 바꾸면 격자를 훑을 때 어느 칸이 실패인지 눈에
  //   띄지 않아, 스무 칸 중 하나가 빨간 것을 놓친다. 그래서 칸 본체의 배경과 안에 적는 말이 함께 갈린다.
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import { versionAspectCss } from '../marketingAspect';
  import type { SegmentProgress } from '../generationProgress';

  interface Props {
    segment: SegmentProgress;
    // 이 세그먼트가 속한 버전. 상자 비율이 여기서 나온다.
    version: VersionMode;
    // 이 세그먼트만 다시 만든다.
    //
    // 없으면 재생성 버튼을 그리지 않는다. 눌러도 아무 일 없는 버튼이나 영구 비활성 버튼은
    // "곧 된다" 는 거짓 약속이 된다. 지금 이 콜백을 주는 곳은 dev 목뿐이고, 실제 경로는 세그먼트
    // 단위 재렌더가 서버에 생긴 뒤에 준다.
    onRegenerate?: () => void;
  }
  let { segment, version, onRegenerate }: Props = $props();

  /** 길이 표시 00:08. 분을 넘겨도 같은 자리수로 읽히게 둘 다 채운다. */
  function clock(sec: number): string {
    const s = Math.max(0, Math.round(sec));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  const status = $derived(segment.status);

  /** 만들어진 세그먼트 영상. 눌러 재생한다(카드가 작아 컨트롤 대신 화면 전체를 버튼으로 쓴다) */
  let videoEl = $state<HTMLVideoElement | null>(null);
  let playing = $state(false);
  /**
   * 영상이 알려 준 길이. 선언된 길이가 없을 때만 쓴다.
   *
   * 선언된 값이 우선인 이유 둘. 그것이 이 세그먼트가 무엇인지 말하는 쪽(서버)의 값이고, 파일이
   * 알려 주는 길이는 이 세그먼트의 길이가 아닐 수 있다. 한 파일의 한 구간만 쓰는 경우
   * (`#t=시작,끝`) `duration` 은 구간이 아니라 파일 전체를 답한다.
   */
  let loadedDuration = $state<number | null>(null);
  const shownDuration = $derived(segment.durationSec ?? loadedDuration);

  function togglePlay(): void {
    const el = videoEl;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }
  // 칸 본체: 상태마다 배경과 문구가 다르다. 완료만 실제 화면(썸네일 자리)을 보여준다.
  const bodyClass = $derived(
    status === 'done'
      ? 'bg-fg/85 text-surface'
      : status === 'running'
        ? 'bg-accent-bg text-accent-fg'
        : 'bg-hover text-fg-subtle',
  );
  const badge = $derived(
    status === 'done'
      ? { label: '완료', cls: 'bg-success-bg text-success-fg' }
      : status === 'running'
        ? { label: '생성중', cls: 'bg-accent-bg text-accent-fg' }
        : { label: '대기', cls: 'bg-hover text-fg-subtle' },
  );
  // 배지 아래 보조 문구. 없으면 줄 자체를 그리지 않는다(빈 줄 방지)
  const note = $derived(
    status === 'running' && segment.etaSec != null
      ? `예상 소요 약 ${Math.round(segment.etaSec)}초`
      : '',
  );
  // 다 만들어진 칸만 다시 만든다. 대기/생성중은 아직 결과가 없어 바꿀 대상이 없다.
  const showRegenerate = $derived(!!onRegenerate && status === 'done');
</script>

<div class="flex flex-col gap-1.5">
  <div
    style="aspect-ratio: {versionAspectCss(version)}"
    class="relative flex w-full items-center justify-center overflow-hidden rounded-lg border border-line text-[11px] font-medium {bodyClass}"
  >
    {#if status === 'done'}
      {#if segment.previewUrl}
        <!-- 만들어진 세그먼트를 그대로 보여준다. 어느 칸을 다시 만들지는 그 칸이 무엇이 되었는지
             봐야 정할 수 있고, 결과 영상을 끝까지 보는 것으로는 칸을 가릴 수 없다.
             muted + playsinline: 클릭 재생이 어느 브라우저에서도 막히지 않게 -->
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          bind:this={videoEl}
          src={segment.previewUrl}
          preload="metadata"
          muted
          playsinline
          loop
          class="h-full w-full object-cover"
          onloadedmetadata={() => {
            if (videoEl && Number.isFinite(videoEl.duration)) loadedDuration = videoEl.duration;
          }}
          onplay={() => (playing = true)}
          onpause={() => (playing = false)}
        ></video>
        <button
          type="button"
          onclick={togglePlay}
          aria-label={`세그먼트 ${segment.order} ${playing ? '멈추기' : '재생'}`}
          class="absolute inset-0 flex items-center justify-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/60 {playing
            ? 'bg-transparent'
            : 'bg-fg/35 hover:bg-fg/25'}"
        >
          {#if !playing}
            <svg class="h-7 w-7 text-surface drop-shadow" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          {/if}
        </button>
      {:else}
        <!-- 주소가 없으면 만들어졌다는 표시만 남는다. 무엇이 되었는지는 결과 영상에서 본다. -->
        <svg class="h-7 w-7 opacity-90" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      {/if}
      {#if shownDuration != null}
        <span
          class="pointer-events-none absolute bottom-1 right-1 rounded bg-fg/60 px-1 py-0.5 text-[10px] tabular-nums text-surface"
        >
          {clock(shownDuration)}
        </span>
      {/if}
    {:else if status === 'running'}
      생성 중...
    {:else}
      대기 중
    {/if}
  </div>

  <div class="flex items-center justify-between gap-1">
    <span class="truncate text-xs font-medium text-fg">세그먼트 {segment.order}</span>
    <span class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium {badge.cls}">
      {badge.label}
    </span>
  </div>

  {#if note}
    <p class="text-[10px] text-fg-subtle">{note}</p>
  {/if}

  {#if showRegenerate}
    <button
      type="button"
      onclick={() => onRegenerate?.()}
      class="rounded-md border border-line px-2 py-1 text-[11px] text-fg-muted transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      재생성
    </button>
  {/if}
</div>
