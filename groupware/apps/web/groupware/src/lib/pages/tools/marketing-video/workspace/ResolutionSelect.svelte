<script lang="ts">
  // 원천 영상 화질 선택: '영상 만들기' 바 위에 얹는 작은 컨트롤
  //
  // 화질을 고를 수 있는지는 설정에서 고른 영상 모델이 정한다(`@csc/video-capabilities`)
  //   지원 모델(Grok Imagine 등) → 등급 토글. 미지원(자체 Wan 등) → 조정 불가 안내 + 기본 화질 표기
  // 여기서 고른 값은 만들기 요청에 실려 렌더 캔버스를 정하고, 영상 프로젝트에 스냅샷으로 저장돼
  //   재렌더도 같은 화질로 재현된다. 서버가 같은 규칙으로 clamp 하므로 이 UI 는 표시 책임만 진다.
  import {
    DEFAULT_VIDEO_RESOLUTION,
    supportsResolutionChoice,
    videoResolutionsFor,
    type VideoResolution,
  } from '@csc/video-capabilities';

  interface Props {
    // 내가 고른 영상 모델 key. 빈 값이면 기본 모델(= 조정 미지원)로 본다.
    videoModelKey: string;
    // 선택된 화질
    value: VideoResolution;
    // 화질 변경. 미지원 모델이면 호출되지 않는다.
    onChange: (resolution: VideoResolution) => void;
  }
  let { videoModelKey, value, onChange }: Props = $props();

  // 선택지가 하나뿐이면 고를 것이 없다: 그 판정도 공유 패키지가 소유한다.
  const options = $derived(
    supportsResolutionChoice(videoModelKey) ? videoResolutionsFor(videoModelKey) : [],
  );
  const supported = $derived(options.length > 0);
</script>

<div
  class="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 shadow-lg"
>
  <span class="text-xs text-fg-subtle">화질</span>
  {#if supported}
    <div class="flex items-center gap-0.5" role="group" aria-label="원천 영상 화질">
      {#each options as option (option)}
        <button
          type="button"
          onclick={() => onChange(option)}
          aria-pressed={value === option}
          class="rounded-full px-2.5 py-1 text-xs font-medium transition {value === option
            ? 'bg-fg text-surface'
            : 'text-fg-subtle hover:bg-hover hover:text-fg'}"
        >
          {option}
        </button>
      {/each}
    </div>
  {:else}
    <!-- 미지원 모델: 왜 못 고르는지와 실제로 나올 화질을 함께 알려준다(빈 컨트롤만 두면 고장으로 읽힌다) -->
    <span class="text-xs text-fg-subtle">
      해상도 조정 지원 안 함 (기본 {DEFAULT_VIDEO_RESOLUTION})
    </span>
  {/if}
</div>
