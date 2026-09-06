<script lang="ts">
  // 썸네일 생성: 최종 영상의 한 프레임을 골라 문구를 얹고 PNG 로 저장한다.
  //
  // 전부 브라우저에서 끝난다. 프레임은 <video> 를 원하는 시각으로 옮겨 캔버스에 그려 얻고 합성도
  // 저장도 그 캔버스가 한다. 서버 왕복이 없어 슬라이더를 움직이는 대로 즉시 보인다.
  //
  // 미리보기가 곧 결과물이다. 아래 캔버스와 저장되는 파일은 같은 함수(drawThumbnail)가 렌더 해상도만
  // 다르게 그리고 좌표는 정규화라 비율이 유지된다.
  //
  // 상자는 하나다. <video> 와 결과 미리보기를 위아래로 두면 둘이 같은 프레임을 보여 주고 위 상자가
  // 하는 일이 없다. <video> 는 화면에 두지 않고 프레임을 꺼내는 재료로만 쓴다.
  import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';
  import { downloadBlobAsFile } from '$lib/shared/lib/utils/downloadFile';
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import { versionAspectHeightFactor } from '../marketingAspect';
  import { ensureThumbnailFont } from '../thumbnailFont';
  import {
    DEFAULT_OVERLAY,
    MAX_FONT_SCALE,
    MIN_FONT_SCALE,
    TEXT_COLORS,
    FONT_WEIGHT_STEP,
    MAX_FONT_WEIGHT,
    MIN_FONT_WEIGHT,
    clampFontScale,
    clampFontWeight,
    drawThumbnail,
    overlayLines,
    type ThumbnailOverlay,
  } from '../thumbnailOverlay';

  interface Props {
    // 이 영상을 만든 버전. 영상이 도착하기 전 상자의 출발 비율이 여기서 파생
    version: VersionMode;
    // 병합된 최종 영상 주소. 있으면 원하는 시각의 프레임을 골라 바탕으로 사용
    videoUrl: string | null;
    // 대표 이미지 주소. 영상 프레임을 못 쓸 때의 바탕. 둘 다 없으면 단색
    posterUrl: string | null;
    // 알려진 영상 길이(초). 스크러버의 상한
    //
    // 파일에게 묻지 않고 받는 이유: 길이를 헤더에 담지 않는 파일이 있다. 브라우저가 녹화해 만든
    // webm 이 그렇고(`duration` 이 Infinity 다) 그때 스크러버는 상한을 잡지 못해 잠긴다. 만든 쪽이
    // 아는 값을 그대로 쓰는 편이 파일에게 되묻는 것보다 정확하다.
    durationSec?: number | null;
    // 저장 파일명의 기준
    title: string;
    // 지금 화면의 썸네일을 PNG 로 만들어 주는 함수를 부모에게 건넨다(마운트 시 한 번)
    //
    // 이 편집기에는 저장 버튼이 없다. 창의 마지막 동작('영상 생성')이 그 일까지 함께 하기 때문이고,
    // 그 버튼은 창의 것이라 여기 있을 수 없다. 그래서 그림 대신 만들 수 있는 함수를 넘긴다:
    // 미리 만들어 넘기면 그 뒤의 편집이 반영되지 않아 "보이는 것이 곧 저장되는 것" 이 깨진다.
    onExporterReady?: (exportPng: () => Promise<Blob>) => void;
  }
  let {
    version,
    videoUrl,
    posterUrl,
    title,
    durationSec: knownDuration = null,
    onExporterReady,
  }: Props = $props();

  /** 저장 해상도(가로). 세로는 프레임 비율에서 파생. 썸네일 용도라 원본 해상도까지는 불필요 */
  const EXPORT_WIDTH = 1280;

  let overlay = $state<ThumbnailOverlay>({ ...DEFAULT_OVERLAY });
  /** 문구 빠른 추가 칸. 추가를 누르면 overlay.text 에 한 줄로 부착 */
  let draftLine = $state('');

  let videoEl = $state<HTMLVideoElement | null>(null);
  let previewCanvas = $state<HTMLCanvasElement | null>(null);
  /** 영상 길이(초). 0 이면 아직 메타데이터가 오지 않았거나 영상이 없음 */
  let durationSec = $state(0);
  /** 고른 프레임의 시각(초) */
  let frameTime = $state(0);
  /** 영상을 불러오지 못한 이유. 있으면 바탕이 단색이 되고 그 사실을 화면이 표시 */
  let loadError = $state<string | null>(null);
  let downloading = $state(false);

  /**
   * 프레임 비율(가로/세로). 영상이나 대표 이미지의 실제 크기에서 파생
   *
   * 둘 다 아직 없을 때의 출발값은 그 버전의 화면비에서 파생한다. 1 로 두면 영상이 도착하기 전
   * 한 틱 동안 상자가 정사각이었다가 세로로 튄다(그리고 화면비를 바꿀 때 잊혀지는 자리가 하나 더 생긴다)
   */
  let frameRatio = $state(1 / versionAspectHeightFactor(version));

  /**
   * 불러온 대표 이미지. 영상 프레임을 못 쓸 때의 바탕
   *
   * `<img>` 로 화면에 놓지 않고 여기서 직접 만드는 이유: 이 그림은 보여 주려는 것이 아니라 캔버스에
   * 그릴 재료다. 화면에 보이는 상자는 하나뿐이고(캔버스), 이 그림은 그 안에 그려진다.
   */
  let posterImage = $state<HTMLImageElement | null>(null);

  const lines = $derived(overlayLines(overlay.text));
  const canPickFrame = $derived(!!videoUrl && !loadError && durationSec > 0);

  /**
   * 저장본의 세로 픽셀. 글자 크기를 px 로 보여 주는 기준
   *
   * 비율(fontScale)로 들고 px 로 보여 주는 이유: 미리보기와 저장본은 크기가 다르므로 값 자체는
   * 비율이어야 하고(정규화 좌표와 같은 이유), 사람은 글자 크기를 px 로 인식
   */
  const exportHeight = $derived(Math.max(1, Math.round(EXPORT_WIDTH / frameRatio)));
  /** 지금 글자 크기(저장본 기준 px). 입력 칸이 이 값을 표시하고 수신 */
  const fontPx = $derived(Math.round(clampFontScale(overlay.fontScale) * exportHeight));
  const minFontPx = $derived(Math.max(1, Math.round(MIN_FONT_SCALE * exportHeight)));
  const maxFontPx = $derived(Math.round(MAX_FONT_SCALE * exportHeight));

  /** px 로 받은 값을 비율로 되돌린다. 빈 칸/지우는 도중이면 그리기가 알아서 접는다(clampFontScale) */
  function setFontPx(px: number): void {
    overlay.fontScale = px / exportHeight;
  }

  /**
   * 글꼴을 받아 두고 도착하면 한 번 더 렌더
   *
   * 기다렸다가 처음 그리지 않는 이유: 그 사이 상자가 비어 있으면 화면이 멈춘 것처럼 보인다.
   * 폴백 글꼴로 먼저 그리고, 도착하면 같은 그림을 제 글꼴로 다시 렌더
   */
  $effect(() => {
    void ensureThumbnailFont().then(renderPreview);
  });

  // 대표 이미지 로드. 주소가 바뀌면 다시 받는다(결과가 바뀌면 바탕도 바뀐다)
  $effect(() => {
    const url = posterUrl;
    if (!url) {
      posterImage = null;
      return;
    }
    const img = new Image();
    // 영상과 같은 이유로 필요하다. 없으면 이 그림을 그린 캔버스가 오염되어 저장이 막힌다.
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // 여기서 다시 그리지 않는다. 아래 그리기 효과가 posterImage 와 frameRatio 를 읽고 있어서,
      //   이 대입만으로 한 번 그려진다(직접 부르면 같은 변화에 두 번 그린다)
      posterImage = img;
      // 영상이 비율을 정하지 못했을 때만 이 그림의 비율을 쓴다(영상이 있으면 그쪽이 진짜다)
      if (!videoUrl && img.naturalWidth > 0) frameRatio = img.naturalWidth / img.naturalHeight;
    };
    img.src = url;
    return () => {
      // 아직 로드 중이면 결과를 버린다. 늦게 도착한 그림이 다음 결과의 바탕을 덮지 않게
      img.onload = null;
    };
  });

  /**
   * 지금 그릴 바탕. 영상 프레임이 준비됐으면 그것, 아니면 대표 이미지, 둘 다 없으면 없음(단색)
   *
   * 영상이 먼저인 이유: 사람이 고른 프레임이 대표 이미지보다 그 사람의 의도에 가깝다.
   */
  function baseSource(): CanvasImageSource | null {
    if (videoEl && videoUrl && !loadError && videoEl.readyState >= 2) return videoEl;
    return posterImage;
  }

  /** 미리보기 캔버스를 다시 그린다. 오버레이가 바뀔 때마다, 그리고 프레임이 바뀔 때마다 */
  function renderPreview(): void {
    const canvas = previewCanvas;
    if (!canvas) return;
    const width = canvas.clientWidth || 320;
    const height = Math.round(width / frameRatio);
    // 캔버스의 그리기 해상도는 CSS 크기와 별개. 맞춰 두지 않으면 흐릿하게 늘어남
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawThumbnail(ctx, baseSource(), overlay, width, height);
  }

  // 오버레이가 바뀌면 즉시 다시 그린다. 프레임 이동은 seeked 이벤트가 따로 부른다(비동기라서)
  $effect(() => {
    // 의존을 명시적으로 읽는다. 객체째 읽으면 필드 하나만 바뀌어도 도는 것이 맞다.
    void overlay.text;
    void overlay.fontScale;
    void overlay.weight;
    void overlay.color;
    void overlay.dimOpacity;
    void overlay.x;
    void overlay.y;
    void frameRatio;
    void posterImage;
    renderPreview();
  });

  function handleLoaded(): void {
    const el = videoEl;
    if (!el) return;
    // 알려진 길이가 먼저다. 파일이 길이를 담지 않은 경우(녹화 webm)가 이 값이 있는 이유다.
    durationSec = knownDuration ?? (Number.isFinite(el.duration) ? el.duration : 0);
    if (el.videoWidth > 0 && el.videoHeight > 0) frameRatio = el.videoWidth / el.videoHeight;
    // 첫 프레임은 검은 화면인 경우가 많아 조금 뒤로 이동
    seekTo(Math.min(durationSec, 1));
  }

  function seekTo(seconds: number): void {
    frameTime = seconds;
    if (videoEl && canPickFrame) videoEl.currentTime = seconds;
  }

  /**
   * 문구 한 줄 추가. 빈 줄은 넣지 않는다(추가를 잘못 눌러 빈 줄이 생기면 글자 블록이 밀린다)
   */
  function addLine(): void {
    const line = draftLine.trim();
    if (!line) return;
    overlay.text = overlay.text ? `${overlay.text}\n${line}` : line;
    draftLine = '';
  }

  function removeLine(index: number): void {
    overlay.text = lines.filter((_, i) => i !== index).join('\n');
  }

  /**
   * 미리보기 위에서 글자 블록을 끌어 이동. 좌표는 정규화라 저장본에서도 같은 자리
   * 포인터 캡처를 쓰는 이유: 캔버스 밖으로 끌어도 놓을 때까지 추적되기 때문
   */
  function startDrag(event: PointerEvent): void {
    const canvas = event.currentTarget as HTMLCanvasElement;
    canvas.setPointerCapture(event.pointerId);
    moveTo(event, canvas);
  }

  function onDrag(event: PointerEvent): void {
    const canvas = event.currentTarget as HTMLCanvasElement;
    if (!canvas.hasPointerCapture(event.pointerId)) return;
    moveTo(event, canvas);
  }

  function moveTo(event: PointerEvent, canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    overlay.x = (event.clientX - rect.left) / rect.width;
    overlay.y = (event.clientY - rect.top) / rect.height;
  }

  /**
   * 저장본을 큰 해상도로 다시 그려 PNG 로 만든다. 받아 두기와 워크스페이스에 남기기가 같은 그림을
   * 쓴다. 갈리면 화면에서 본 것과 목록에 남은 것이 달라진다.
   *
   * 미리보기 캔버스를 그대로 쓰지 않는 이유는 그것이 화면 폭에 맞춘 크기라 300px 짜리 썸네일이
   * 되기 때문이다. 좌표가 정규화라 같은 함수를 큰 캔버스에 한 번 더 돌리면 그대로 확대된다.
   *
   * 영상이 다른 오리진에서 왔는데 CORS 헤더가 없으면 캔버스가 오염되어 `toBlob` 이 던진다.
   * 삼키지 않고 던진다. 조용히 저장하면 글자만 있는 그림을 받아 놓고 이유를 알 수 없다.
   */
  async function exportPng(): Promise<Blob> {
    // 미리보기와 같은 글꼴로 저장되어야 함. 캔버스는 로드를 기다려 주지 않아 여기서 대기
    //   (미리보기는 이미 그려져 있고 이 시점이면 대개 끝나 있다)
    await ensureThumbnailFont();
    const width = EXPORT_WIDTH;
    const height = exportHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('캔버스를 만들지 못했습니다.');
    drawThumbnail(ctx, baseSource(), overlay, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('이미지를 만들지 못했습니다.');
    return blob;
  }

  /** 만든 PNG 를 파일로 받는다. 그림을 만들지 못하면 사유를 알린다(빈 파일을 주지 않는다) */
  async function downloadThumbnail(): Promise<void> {
    downloading = true;
    try {
      downloadBlobAsFile(await exportPng(), title || '썸네일', 'png');
    } catch {
      toastStore.error(
        '썸네일을 저장하지 못했습니다',
        '영상 프레임을 이미지로 옮기지 못했습니다. 잠시 후 다시 시도하세요.',
        { key: 'thumbnail-download-failed' },
      );
    } finally {
      downloading = false;
    }
  }

  // 만드는 함수를 창에 전달. 창의 '영상 생성' 을 누르는 순간 이 함수를 불러 최신 그림을 수신
  $effect(() => {
    onExporterReady?.(exportPng);
  });
</script>

<section class="flex flex-col gap-3 rounded-xl border border-line p-4">
  <div class="flex flex-col gap-0.5">
    <h3 class="text-sm font-semibold text-fg">썸네일 생성</h3>
    <p class="text-xs text-fg-subtle">
      영상 구간을 선택해 썸네일을 만들고 문구와 덮기를 조정하세요.
    </p>
  </div>

  <div class="grid gap-4 md:grid-cols-[1fr_18rem]">
    <!--
      왼쪽: 프레임 고르기와 결과 확인이 한 상자에서 발생
    -->
    <div class="flex flex-col gap-2">
      <div class="relative flex flex-col gap-1">
        <!--
          프레임을 꺼내는 재료. 화면에 두지 않는다(캔버스가 그 프레임을 그린다)
          display:none 이 아니라 1px 로 두는 이유: 렌더 트리에서 빠지면 브라우저가 디코드를 멈출 수 있고,
            그러면 캔버스에 그릴 프레임 자체가 없어진다.
          crossorigin: 이것이 없으면 프레임을 캔버스에 그리는 순간 캔버스가 오염되어 저장이 막힌다.
        -->
        {#if videoUrl}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            bind:this={videoEl}
            src={videoUrl}
            crossorigin="anonymous"
            preload="metadata"
            muted
            playsinline
            aria-hidden="true"
            tabindex="-1"
            class="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
            onloadedmetadata={handleLoaded}
            onseeked={renderPreview}
            onerror={() => (loadError = '영상을 불러오지 못했습니다.')}
          ></video>
        {/if}

        <!-- 캔버스에 직접 role 을 주지 않는다(캔버스는 이미 img 계열이다). 끌기를 받는 것은 캔버스이고,
             설명은 아래 문단 담당. 위치 조정은 보조 수단일 뿐 이것 없이도 썸네일이 완성됨
             aspect-ratio 를 함께 주는 이유: 첫 그리기 전의 캔버스 기본 크기(300x150)로 한 틱 보이지 않게 -->
        <canvas
          bind:this={previewCanvas}
          onpointerdown={startDrag}
          onpointermove={onDrag}
          style="aspect-ratio: {frameRatio}"
          class="w-full cursor-move touch-none rounded-lg border border-line bg-hover"
          aria-label="썸네일 미리보기"
        ></canvas>
      </div>

      <div class="flex flex-col gap-1">
        <input
          type="range"
          min="0"
          max={durationSec || 1}
          step="0.1"
          value={frameTime}
          disabled={!canPickFrame}
          oninput={(e) => seekTo(Number(e.currentTarget.value))}
          aria-label="썸네일로 쓸 프레임 선택"
          class="w-full accent-brand disabled:opacity-40"
        />
        <p class="text-[10px] leading-relaxed text-fg-subtle">
          {#if canPickFrame}
            타임라인에서 프레임을 고릅니다(지금 {frameTime.toFixed(1)}초). 위 그림이 곧 저장되는
            그림이고, 문구는 끌어서 옮깁니다.
          {:else if loadError}
            {loadError}
            {posterUrl ? '대표 이미지를 바탕으로 씁니다.' : '바탕 없이 문구만 얹습니다.'}
          {:else if posterUrl}
            고를 프레임이 없어 대표 이미지를 바탕으로 씁니다. 문구는 끌어서 옮깁니다.
          {:else}
            영상도 대표 이미지도 없습니다. 문구만으로 썸네일을 만들 수 있습니다.
          {/if}
        </p>
      </div>
    </div>

    <!-- 오른쪽: 편집 옵션 -->
    <div class="flex flex-col gap-4 rounded-lg border border-line bg-elevated p-3">
      <div class="flex flex-col gap-1.5">
        <span class="text-[11px] font-medium text-fg-muted">썸네일 문구</span>
        <div class="flex gap-1.5">
          <input
            type="text"
            bind:value={draftLine}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addLine();
              }
            }}
            placeholder="예: 완벽 하이라이터 발견"
            class="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          />
          <button
            type="button"
            onclick={addLine}
            disabled={!draftLine.trim()}
            class="shrink-0 rounded-md bg-fg px-2.5 py-1.5 text-xs font-medium text-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            추가
          </button>
        </div>
        {#if lines.length > 0}
          <ul class="flex flex-col gap-1">
            {#each lines as line, i (`${i}:${line}`)}
              <li class="flex items-center gap-1 rounded-md bg-hover px-2 py-1">
                <span class="min-w-0 flex-1 truncate text-[11px] text-fg">{line}</span>
                <button
                  type="button"
                  onclick={() => removeLine(i)}
                  class="shrink-0 rounded px-1 text-[11px] text-fg-subtle transition hover:text-danger-fg"
                  aria-label={`${line} 삭제`}
                >
                  ×
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="flex flex-col gap-1">
        <span class="flex items-center justify-between text-[11px] font-medium text-fg-muted">
          <span>텍스트 크기</span>
          <!-- 슬라이더로 어림잡고, 값을 정확히 알 때는 여기 입력. 둘은 같은 값을 다르게 만질 뿐 -->
          <span class="flex items-center gap-1">
            <!--
              적는 칸은 다 적은 뒤에 반영한다(oninput 이 아니라 onchange)
              글자마다 반영하면 범위 밖 값이 곧바로 잘려 되돌아오는데, 그 되돌림이 아직 적는 중인
                숫자를 덮어쓴다: 120 을 적으려고 1 을 누른 순간 최소값으로 튄다.
              적기를 마치면(포커스를 떠나거나 Enter) 그때 범위로 접힌다.
            -->
            <input
              type="number"
              min={minFontPx}
              max={maxFontPx}
              step="1"
              value={fontPx}
              onchange={(e) => setFontPx(Number(e.currentTarget.value))}
              aria-label="텍스트 크기(픽셀)"
              class="w-16 rounded-md border border-line bg-surface px-1.5 py-0.5 text-right text-[11px] tabular-nums text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            />
            <span class="text-fg-subtle">px</span>
          </span>
        </span>
        <input
          type="range"
          min={minFontPx}
          max={maxFontPx}
          step="1"
          value={fontPx}
          oninput={(e) => setFontPx(Number(e.currentTarget.value))}
          aria-label="텍스트 크기"
          class="w-full accent-brand"
        />
        <p class="text-[10px] text-fg-subtle">
          저장되는 이미지({EXPORT_WIDTH}×{exportHeight}) 기준입니다. 미리보기는 화면 크기에 맞춰
          같은 비율로 보여줍니다.
        </p>
      </div>

      <div class="flex flex-col gap-1">
        <span class="flex items-center justify-between text-[11px] font-medium text-fg-muted">
          <span>텍스트 굵기</span>
          <!-- 크기와 같은 짝. 슬라이더로 어림잡고, 값을 정확히 알 때는 입력 -->
          <span class="flex items-center gap-1">
            <input
              type="number"
              min={MIN_FONT_WEIGHT}
              max={MAX_FONT_WEIGHT}
              step={FONT_WEIGHT_STEP}
              value={overlay.weight}
              onchange={(e) => (overlay.weight = clampFontWeight(Number(e.currentTarget.value)))}
              aria-label="텍스트 굵기"
              class="w-16 rounded-md border border-line bg-surface px-1.5 py-0.5 text-right text-[11px] tabular-nums text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            />
          </span>
        </span>
        <input
          type="range"
          min={MIN_FONT_WEIGHT}
          max={MAX_FONT_WEIGHT}
          step={FONT_WEIGHT_STEP}
          value={overlay.weight}
          oninput={(e) => (overlay.weight = clampFontWeight(Number(e.currentTarget.value)))}
          aria-label="텍스트 굵기"
          class="w-full accent-brand"
        />
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-[11px] font-medium text-fg-muted">텍스트 색상</span>
        <div class="flex items-center gap-1.5">
          {#each TEXT_COLORS as color (color)}
            <button
              type="button"
              onclick={() => (overlay.color = color)}
              aria-pressed={overlay.color === color}
              aria-label={`색상 ${color}`}
              style="background-color: {color}"
              class="h-6 w-6 rounded border-2 transition {overlay.color === color
                ? 'border-fg'
                : 'border-line'}"
            ></button>
          {/each}
          <!-- 프리셋 밖의 색: 브라우저 색 선택기를 그대로 쓴다(색상환을 직접 만들 이유가 없다) -->
          <label
            class="flex h-6 w-6 cursor-pointer items-center justify-center rounded border-2 border-dashed border-line text-[11px] text-fg-subtle transition hover:border-fg hover:text-fg"
            title="직접 고르기"
          >
            +
            <input type="color" bind:value={overlay.color} class="sr-only" />
          </label>
        </div>
      </div>

      <label class="flex flex-col gap-1">
        <span class="flex items-center justify-between text-[11px] font-medium text-fg-muted">
          <span>오버레이 투명도</span>
          <span class="tabular-nums text-fg">{Math.round(overlay.dimOpacity * 100)}%</span>
        </span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          bind:value={overlay.dimOpacity}
          class="w-full accent-brand"
        />
      </label>

      <p class="rounded-md bg-accent-bg px-2 py-1.5 text-[10px] leading-relaxed text-accent-fg">
        문구는 고른 색 그대로 그려집니다. 밝은 장면에서 글자가 묻히면 아래 덮기를 올리세요.
      </p>

      <!--
        여기 있는 것은 받아 가는 동작 하나다. 이 그림을 영상에 붙이는 일은 창의 마지막 버튼
        ('영상 생성')이 함께 담당. 끝맺음이 둘로 갈리면 어느 것을 눌러야 끝나는지 알 수 없음
      -->
      <button
        type="button"
        onclick={() => void downloadThumbnail()}
        disabled={downloading}
        class="rounded-full border border-line px-3 py-2 text-xs font-medium text-fg transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {downloading ? '내려받는 중...' : '썸네일 다운로드'}
      </button>
    </div>
  </div>
</section>
