<script lang="ts">
  // 공용 검색 입력: 돋보기 아이콘 + 입력 중일 때만 뜨는 지우기 버튼
  //   같은 마크업이 용어 사전/단어 관리에 통째로 복제돼 있어 하나로 뽑았다(보관함이 세 번째 복사본이 되지 않게)
  //   폭은 정하지 않는다: 화면 방향에 따라 전체 폭/고정 폭이 갈리므로 호출부가 class 로 준다.
  interface Props {
    value: string;
    // 스크린리더 라벨도 겸한다. 검색창은 placeholder 가 곧 용도 설명이라 따로 둘 이유가 없다.
    placeholder: string;
    // 바깥 래퍼 클래스: 폭 지정용(예: 'w-full' / 'w-72')
    class?: string;
  }
  let { value = $bindable(), placeholder, class: className = '' }: Props = $props();
</script>

<div class="relative min-w-0 {className}">
  <svg
    class="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-fg-subtle"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </svg>
  <input
    type="text"
    bind:value
    {placeholder}
    aria-label={placeholder}
    class="w-full rounded-lg border border-line bg-elevated py-1.5 pr-8 pl-8 text-sm text-fg placeholder:text-fg-subtle transition focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15"
  />
  {#if value}
    <button
      type="button"
      onclick={() => (value = '')}
      aria-label="검색어 지우기"
      class="absolute top-1/2 right-2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-fg-subtle transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
    >
      <svg
        class="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  {/if}
</div>
