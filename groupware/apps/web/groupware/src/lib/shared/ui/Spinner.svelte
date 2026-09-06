<script lang="ts">
  // 공용 로딩 인디케이터(회전 링). 같은 SVG 가 마케팅 영상 도구 다섯 곳에 복제돼 있어 하나로 뽑았다.
  //   크기와 색은 호출부가 class 로 준다(예: 'h-4 w-4 text-fg-subtle'). 글자 옆에 붙는 장식이면
  //   기본대로 보조기기에서 숨기고, 그 자리에서 이것이 유일한 신호면 label 을 주어 읽히게 한다.
  interface Props {
    // 크기와 색. 기본은 본문 글자 크기의 링
    class?: string;
    // 스크린리더에 읽힐 말. 없으면 장식(aria-hidden)
    label?: string;
  }
  let { class: className = 'h-4 w-4', label }: Props = $props();
</script>

<svg
  class="shrink-0 animate-spin {className}"
  viewBox="0 0 24 24"
  fill="none"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>
  <circle class="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" />
  <path
    class="opacity-90"
    d="M21 12a9 9 0 0 0-9-9"
    stroke="currentColor"
    stroke-width="3"
    stroke-linecap="round"
  />
</svg>
