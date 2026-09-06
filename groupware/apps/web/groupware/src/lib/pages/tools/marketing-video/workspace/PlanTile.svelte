<script lang="ts">
  // 기획안 타일: 워크스페이스 그리드의 한 칸. 생성 중 라이브 배치와 저장본 그리드가 함께 쓴다.
  // 두 그리드가 같은 타일로 보여야 하므로(같은 크기/비율/호버) 마크업을 여기 한 곳에 둔다.
  // 다른 점은 썸네일 위 오버레이(진행/실패 배지)뿐이라 overlay 스니펫으로 받는다(저장본은 넘기지 않음)
  //   우상단 선택 체크박스(빈 토글)는 selectable 이면 항상 노출: 저장본은 보기 모드에서도 바로 선택(→ 하단 '영상 만들기' 바)
  //   타일 본체 클릭: selectMode 면 선택(선택 진행 중/삭제 모드), 아니면 상세 열기. 실제 실행은 하단 중앙 바에서 일괄
  import type { Snippet } from 'svelte';
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import { versionAspectCss } from '../marketingAspect';
  import SelectToggle from '../shared/SelectToggle.svelte';
  import InfoPopover from '../shared/InfoPopover.svelte';

  interface Props {
    // 이 타일이 속한 버전. 상자 비율이 여기서 나온다(v1.0 은 프레임 안에 앉는 4:5, v1.5 는 9:16)
    //
    // 한 값으로 두면 한쪽 버전의 그림이 다른 모양의 상자에 담긴다. `object-cover` 라 그림 자체는
    // 멀쩡해 보이고 잘린 사실만 조용히 남는다.
    version: VersionMode;
    // 썸네일 URL: 없으면 placeholder(스니펫/문구)
    src?: string | null;
    title: string;
    // 타일 클릭: 상세 열기(선택 아닐 때)
    onOpen?: () => void;
    // 우상단 선택 체크박스(빈 토글) 노출: 저장본 타일은 항상 true(보기 모드에서 바로 선택)
    selectable?: boolean;
    // 켜면 타일 본체 클릭도 선택(선택 진행 중/삭제). 끄면 본체 클릭=상세
    selectMode?: boolean;
    // 선택됨
    selected?: boolean;
    // 선택 토글
    onToggleSelect?: () => void;
    // 썸네일이 없을 때 표시할 내용(예: 스피너). 없으면 '이미지 없음'
    placeholder?: Snippet;
    // 썸네일 위 하단 배지(예: '생성 중 2/6'). 없으면 표시 안 함
    overlay?: Snippet;
    // 생성 정보(i 버튼 팝오버) 행: 있으면 우상단(선택 토글 왼쪽)에 i 버튼. 저장본 타일만 전달(생성 중 라이브 타일은 미전달)
    info?: { label: string; value: string }[];
  }
  let {
    version,
    src = null,
    title,
    onOpen,
    selectable = false,
    selectMode = false,
    selected = false,
    onToggleSelect,
    placeholder,
    overlay,
    info,
  }: Props = $props();
</script>

<div class="group relative flex flex-col gap-1.5">
  <button
    type="button"
    onclick={() => (selectMode ? onToggleSelect?.() : onOpen?.())}
    class="flex w-full cursor-pointer flex-col gap-1.5 text-left focus:outline-none"
  >
    <div
      style="aspect-ratio: {versionAspectCss(version)}"
      class="relative w-full overflow-hidden rounded-lg border bg-surface transition {selected
        ? 'border-fg ring-2 ring-fg'
        : 'border-line hover:border-fg/40'}"
    >
      {#if src}
        <img {src} alt={title} class="h-full w-full object-cover" />
      {:else if placeholder}
        <div class="flex h-full w-full items-center justify-center">{@render placeholder()}</div>
      {:else}
        <div class="flex h-full w-full items-center justify-center text-[10px] text-fg-subtle">
          이미지 없음
        </div>
      {/if}
      {#if overlay}
        <div
          class="absolute inset-x-0 bottom-0 bg-fg/70 px-2 py-1 text-center text-[10px] font-medium text-surface"
        >
          {@render overlay()}
        </div>
      {/if}
      {#if selected}
        <div class="absolute inset-0 bg-fg/25"></div>
      {/if}
    </div>
    <span class="truncate text-xs font-medium text-fg">{title}</span>
  </button>
  <!-- 우상단 선택 체크박스(빈 토글): selectable 이면 항상 노출(저장본은 보기 모드에서도 바로 선택)
       타일 본체 button 의 형제(중첩 button 회피). 영상 만들기/삭제 실행은 하단 중앙 바에서 -->
  {#if selectable}
    <SelectToggle checked={selected} onToggle={() => onToggleSelect?.()} label={`${title} 선택`} />
  {/if}
  <!-- 생성 정보(i): info 가 있고 선택 중이 아닐 때만. 선택 중에는 우상단이 토글 차지라 둘을 함께
       두면 좁은 자리에서 서로를 가린다. InfoPopover 가 스스로 우상단(토글 왼쪽)에 배치. 외곽 div 가
       relative + overflow 밖이라 팝오버가 안 잘린다. -->
  {#if info && info.length > 0 && !selectMode}
    <InfoPopover items={info} ariaLabel={`${title} 생성 정보`} />
  {/if}
</div>
