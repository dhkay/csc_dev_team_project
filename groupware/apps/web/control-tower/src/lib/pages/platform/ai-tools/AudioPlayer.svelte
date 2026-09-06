<script module lang="ts">
  // 한 번에 한 트랙만 재생: 모든 AudioPlayer 인스턴스(BGM/효과음)가 공유하는 조정자
  //   새 트랙이 재생을 시작하면 직전 트랙을 강제 정지한다. 강제 정지 시 그 트랙은 처음으로 되감고 상태/재생바를 초기화한다.
  interface PlayToken {
    stop: () => void;
  }
  let active: PlayToken | null = null;
  function claimPlayback(token: PlayToken): void {
    if (active && active !== token) active.stop();
    active = token;
  }
  function releasePlayback(token: PlayToken): void {
    if (active === token) active = null;
  }
</script>

<script lang="ts">
  // 커스텀 오디오 플레이어(플랫폼 관리): 재생 컨트롤과 스크럽바(재생 위치)를 분리
  //   좁은 그리드 카드에서도 스크럽바가 폭 전체를 독립적으로 차지해 재생 위치 이동이 편하다.
  //   groupware marketing-video AudioPlayer 와 동형(스타일만 control-tower gray/brand). 재생은 한 번에 하나만(위 module)
  import { onDestroy } from 'svelte';

  interface Props {
    src: string;
  }
  let { src }: Props = $props();

  let el = $state<HTMLAudioElement | null>(null);
  let playing = $state(false);
  let current = $state(0);
  let duration = $state(0);
  // 드래그/키보드 탐색 중에는 timeupdate 가 위치를 덮어쓰지 않도록 잠근다.
  let scrubbing = $state(false);

  const pct = $derived(duration > 0 ? (current / duration) * 100 : 0);

  // 강제 정지(다른 트랙이 재생 시작): 정지 + 처음으로 되감기 + 상태/재생바 초기화
  function forceStop(): void {
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    playing = false;
    current = 0;
  }
  const token: PlayToken = { stop: forceStop };

  // 언마운트(탭 전환 등)로 사라질 때 재생 중이면 멈추고 조정자에서 해제한다(고아 재생/참조 방지)
  onDestroy(() => {
    if (el) el.pause();
    releasePlayback(token);
  });

  function toggle(): void {
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }
  function onTimeUpdate(): void {
    if (el && !scrubbing) current = el.currentTime;
  }
  function onLoaded(): void {
    if (el) duration = Number.isFinite(el.duration) ? el.duration : 0;
  }
  /** 스크럽 입력: 위치를 즉시 이동(라이브 seek). 정지 상태에서 건드리면 그 트랙을 재생(단일 재생 조정자가 나머지 정지) */
  function onSeek(e: Event): void {
    const v = Number((e.currentTarget as HTMLInputElement).value);
    current = v;
    if (!el) return;
    el.currentTime = v;
    if (el.paused) void el.play();
  }
  function fmt(s: number): string {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }
</script>

<!-- svelte-ignore a11y_media_has_caption -->
<audio
  bind:this={el}
  {src}
  preload="metadata"
  onplay={() => {
    playing = true;
    claimPlayback(token);
  }}
  onpause={() => {
    // 수동 일시정지는 위치를 보존(이어듣기). 강제 정지는 forceStop 이 이미 0으로 초기화한다.
    playing = false;
  }}
  onended={() => {
    // 자연 종료: 처음으로 되감고 상태 초기화 + 조정자 해제
    playing = false;
    current = 0;
    if (el) el.currentTime = 0;
    releasePlayback(token);
  }}
  ontimeupdate={onTimeUpdate}
  onloadedmetadata={onLoaded}
></audio>

<div class="flex flex-col gap-1.5">
  <!-- 재생 위치(스크럽): 카드 폭 전체를 독립적으로 차지 -->
  <input
    type="range"
    min="0"
    max={duration || 0}
    step="0.1"
    value={current}
    disabled={duration === 0}
    oninput={onSeek}
    onpointerdown={() => (scrubbing = true)}
    onpointerup={() => (scrubbing = false)}
    onpointercancel={() => (scrubbing = false)}
    aria-label="재생 위치"
    class="ct-seek"
    style={`--pct:${pct}%`}
  />

  <!-- 재생 컨트롤 -->
  <div class="flex items-center gap-2">
    <button
      type="button"
      onclick={toggle}
      aria-label={playing ? '일시정지' : '재생'}
      title={playing ? '일시정지' : '재생'}
      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
    >
      {#if playing}
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
      {:else}
        <svg class="h-3.5 w-3.5 translate-x-[1px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
      {/if}
    </button>
    <span class="ml-auto text-[11px] tabular-nums text-gray-500">{fmt(current)} / {fmt(duration)}</span>
  </div>
</div>

<style>
  /* 스크럽바: 얇은 트랙 + 진행 채움(--pct). control-tower 라이트 테마(gray/brand) */
  .ct-seek {
    width: 100%;
    height: 6px;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    border-radius: 9999px;
    background: linear-gradient(
      to right,
      var(--color-brand, #1868db) 0%,
      var(--color-brand, #1868db) var(--pct, 0%),
      #e5e7eb var(--pct, 0%),
      #e5e7eb 100%
    );
  }
  .ct-seek:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ct-seek::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    height: 14px;
    width: 14px;
    border-radius: 9999px;
    background: var(--color-brand, #1868db);
    border: 2px solid #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  }
  .ct-seek::-moz-range-thumb {
    height: 14px;
    width: 14px;
    border-radius: 9999px;
    background: var(--color-brand, #1868db);
    border: 2px solid #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  }
  .ct-seek:focus-visible {
    outline: 2px solid var(--color-brand, #1868db);
    outline-offset: 2px;
  }
</style>
