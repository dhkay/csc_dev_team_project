<script lang="ts">
  // 결과 확인: 생성이 끝난 뒤 창이 마지막으로 보여주는 화면
  //
  // 여기 있는 영상은 세그먼트를 하나로 병합한 최종 영상이다(진행 화면의 병합, 업로드 단계가 만든
  //   것이다). 그래서 이 화면에는 합치는 버튼이 없다. 사람이 한 번 더 눌러야 할 일이 아니다.
  //
  // 그 영상으로 하는 일 셋: 받아 두기, 한 프레임을 골라 썸네일 만들기, 그리고 창 하단의 마지막
  //   동작으로 작업 공간에 배치하기. 배치 전까지 이 영상은 어느 목록에도 없다.
  import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';
  import { downloadUrlAsFile } from '$lib/shared/lib/utils/downloadFile';
  import ThumbnailStudio from './ThumbnailStudio.svelte';
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import { versionAspectCss } from '../marketingAspect';
  import {
    completedAtLabel,
    durationLabel,
    lengthSummary,
    shortLinkLabel,
    type GenerationResult,
  } from '../generationResult';

  interface Props {
    result: GenerationResult;
    // 이 창이 만든 버전. 미리보기 상자와 썸네일 편집기의 비율이 여기서 나온다.
    version: VersionMode;
    // 이 창을 비우고 처음부터 다시 만든다.
    onCreateAnother?: () => void;
    // 썸네일 편집기가 만든 "지금 그림을 PNG 로 만들어 주는 함수" 를 창에 그대로 넘긴다.
    //
    // 이 화면이 그것을 쓰지 않고 통과시키는 이유: 그림을 영상에 붙이는 일은 창의 마지막 동작
    // ('영상 생성')이 하고, 그 버튼은 창의 것이다. 이 화면은 그 사이를 잇기만 한다.
    onExporterReady?: (exportPng: () => Promise<Blob>) => void;
  }
  let { result, version, onCreateAnother, onExporterReady }: Props = $props();

  let downloading = $state(false);

  /** 정보 표. 값이 없는 줄은 아예 그리지 않는다(빈 칸은 아직 오지 않은 값처럼 읽힌다) */
  const infoRows = $derived(
    [
      { label: '영상 길이', value: lengthSummary(result) },
      { label: '영상 생성 방식', value: result.videoModel },
      { label: '완료 시각', value: completedAtLabel(result.completedAt) },
    ].filter((row) => !!row.value),
  );

  /**
   * 최종 영상을 받는다.
   *
   * `<a download>` 로는 안 된다. 결과물이 다른 오리진(file-upload)에 있어 download 속성이 무시되고,
   * mp4 가 inline 으로 서빙되어 저장 대신 재생이 시작된다. 그 우회는 downloadUrlAsFile 이 갖고 있다.
   */
  async function download(): Promise<void> {
    if (!result.videoUrl) return;
    downloading = true;
    try {
      await downloadUrlAsFile(result.videoUrl, result.title || '최종 영상');
    } catch {
      toastStore.error('영상을 내려받지 못했습니다', '잠시 후 다시 시도하세요.', {
        key: 'final-video-download-failed',
      });
    } finally {
      downloading = false;
    }
  }
</script>

<div class="flex flex-col gap-6">
  <section class="flex flex-col gap-3">
    <div class="flex flex-col gap-0.5">
      <h3 class="text-sm font-semibold text-fg">결과 확인</h3>
      <p class="text-xs text-fg-subtle">생성이 완료되었습니다. 결과 영상을 확인하고 내려받으세요.</p>
    </div>

    <div class="grid gap-4 sm:grid-cols-[12rem_1fr]">
      <!-- 미리보기: 세그먼트가 합쳐진 결과라 여기서 처음부터 끝까지 이어 볼 수 있다. -->
      <div
        style="aspect-ratio: {versionAspectCss(version)}"
        class="relative w-full overflow-hidden rounded-lg border border-line bg-hover"
      >
        {#if result.videoUrl}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            src={result.videoUrl}
            controls
            preload="metadata"
            playsinline
            class="h-full w-full object-contain"
          ></video>
        {:else}
          <div class="flex h-full w-full items-center justify-center px-3 text-center">
            <p class="text-[11px] leading-relaxed text-fg-subtle">미리보기를 불러올 수 없습니다.</p>
          </div>
        {/if}
        {#if result.durationSec != null}
          <span
            class="pointer-events-none absolute bottom-1 left-1 rounded bg-fg/70 px-1 py-0.5 text-[10px] tabular-nums text-surface"
          >
            {durationLabel(result.durationSec)}
          </span>
        {/if}
      </div>

      <div class="flex flex-col gap-3">
        <dl class="overflow-hidden rounded-lg border border-line">
          <div class="border-b border-line bg-hover px-3 py-1.5">
            <span class="text-[11px] font-medium text-fg-muted">영상 정보</span>
          </div>
          {#each infoRows as row (row.label)}
            <div class="flex gap-3 border-b border-line px-3 py-1.5 last:border-b-0">
              <dt class="w-24 shrink-0 text-[11px] text-fg-subtle">{row.label}</dt>
              <dd class="min-w-0 flex-1 break-all text-[11px] text-fg">{row.value}</dd>
            </div>
          {/each}
          {#if result.driveUrl}
            <!-- 외부 보관 주소만 링크다. 새 탭으로 여는 이유: 이 창에는 아직 만지던 것(썸네일)이
                 있어 같은 탭에서 나가면 그것이 사라진다. -->
            <div class="flex gap-3 border-b border-line px-3 py-1.5 last:border-b-0">
              <dt class="w-24 shrink-0 text-[11px] text-fg-subtle">Google Drive 링크</dt>
              <dd class="min-w-0 flex-1 text-[11px]">
                <a
                  href={result.driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="break-all text-accent-fg underline underline-offset-2 hover:opacity-80"
                >
                  {shortLinkLabel(result.driveUrl)}
                </a>
              </dd>
            </div>
          {/if}
        </dl>

        <div class="flex flex-wrap gap-1.5">
          <button
            type="button"
            onclick={() => void download()}
            disabled={!result.videoUrl || downloading}
            class="rounded-full bg-fg px-4 py-1.5 text-xs font-medium text-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloading ? '받는 중...' : '다운로드'}
          </button>
          {#if onCreateAnother}
            <button
              type="button"
              onclick={onCreateAnother}
              class="rounded-full border border-line px-4 py-1.5 text-xs font-medium text-fg-muted transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/20"
            >
              새 콘텐츠 생성
            </button>
          {/if}
        </div>

        <!-- 배치 안내는 늘 그린다. 외부 보관 주소가 그 자리를 대신하면 그 값이 생기는 날
             "눌러야 남는다" 는 사실이 조용히 화면에서 빠진다. -->
        <p class="text-[10px] leading-relaxed text-fg-subtle">
          다운로드는 세그먼트가 하나로 합쳐진 최종 영상(mp4)을 받습니다.{#if result.driveUrl}
            위 Google Drive 링크로도 같은 영상에 접근할 수 있습니다.{/if}
          아래 ‘영상 생성’ 을 눌러야 이 영상이 워크스페이스에 남습니다.
        </p>
      </div>
    </div>
  </section>

  <ThumbnailStudio
    {version}
    videoUrl={result.videoUrl}
    posterUrl={result.posterUrl}
    durationSec={result.durationSec}
    title={result.title}
    {onExporterReady}
  />
</div>
