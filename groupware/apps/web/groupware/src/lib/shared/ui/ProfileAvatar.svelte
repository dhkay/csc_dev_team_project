<script lang="ts">
  // 프로필 아바타: 이미지가 있으면 표시, 없으면 공용 기본(실루엣) 폴백
  // 내정보 카드, 앱바, 환경설정 피커가 모두 이 컴포넌트를 써서 기본 이미지를 통합한다.
  interface Props {
    // 프로필 이미지 접근 URL. 없으면 기본 실루엣
    src?: string | null;
    // 원형 크기 클래스(예: 'h-8 w-8')
    sizeClass?: string;
    // 실루엣 아이콘 크기 클래스(아바타 크기에 맞춰 조정)
    iconClass?: string;
    alt?: string;
  }
  let { src = null, sizeClass = 'h-8 w-8', iconClass = 'h-5 w-5', alt = '' }: Props = $props();
</script>

<div
  class="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 {sizeClass}"
>
  {#if src}
    <img {src} {alt} class="h-full w-full object-cover" />
  {:else}
    <svg viewBox="0 0 24 24" class="text-gray-400 {iconClass}" fill="currentColor" aria-hidden="true">
      <path
        d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"
      />
    </svg>
  {/if}
</div>
