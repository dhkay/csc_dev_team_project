<script lang="ts">
  /**
   * cscuniverse 브랜드 로고(심볼 + 워드마크)
   *
   * 색은 currentColor 를 따른다. 부모가 text-* 로 정하므로 어떤 배경에 놓아도 prop 없이 맞는다.
   * 로고 색을 prop 으로 받기 시작하면 쓰는 곳마다 색을 알아야 한다.
   *
   * 워드마크는 SVG 패스가 아니라 살아있는 텍스트다. OS 마다 글자 모양이 조금씩 다르지만 확대와
   * 복사와 낭독이 그대로 된다. 브랜드 폰트를 올리면 이 컴포넌트의 font-* 만 바꾸면 된다.
   */

  // 심볼과 균형용 빈 자리는 항상 같은 크기여야 대칭이 성립한다. 그래서 한 곳에서 정한다.
  const symbolSize = 'h-9 w-9 shrink-0';
</script>

<style>
  /**
   * 심볼과 글자의 세로 중심 맞추기
   *
   * items-center 는 글자 박스를 가운데 두는데 박스 중심과 잉크 중심은 다르다. 어긋나는 양은
   * 폰트가 정하며 line-height 로는 없앨 수 없다(계산에서 상쇄된다).
   *
   * text-box 로 박스를 cap 부터 베이스라인까지 잘라내면 박스 중심이 잉크 중심이 되어
   * items-center 만으로 맞는다. 고정 px 보정은 폰트마다 틀리므로 쓰지 않는다.
   */
  @supports (text-box: trim-both cap alphabetic) {
    .wordmark {
      text-box: trim-both cap alphabetic;
    }
  }

  /**
   * 진입 연출: 궤도를 도는 점이 링(c)을 한 바퀴 돌아 열린 자리에 앉는다.
   *
   * 회전축은 viewBox 중심(16,16)이다. 점의 좌표가 그 중심에서 링의 중심선과 같은 반지름만큼
   * 떨어져 있어, 중심을 축으로 돌리기만 하면 점이 링을 그대로 따라간다.
   *
   * 끝 프레임을 rotate(0) 으로 둔 것이 핵심이다. 마지막 상태가 곧 아무 변형도 없는 평소 모습이라
   * 연출이 실행되지 않는 환경에서도 점은 이미 제자리에 있다. fill-mode 로 끝 상태를 붙잡는
   * 방식에는 그 보장이 없다(연출이 꺼지면 시작 프레임이 그대로 남는다).
   */
  .orbit-dot {
    transform-box: view-box;
    transform-origin: 16px 16px;
    animation: orbit-settle 1400ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  @keyframes orbit-settle {
    from {
      transform: rotate(360deg);
    }
    to {
      transform: rotate(0deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .orbit-dot {
      animation: none;
    }
  }
</style>

<!-- 심볼과 글자 사이. CSS 간격보다 눈에 보이는 틈이 넓다: 심볼 우측 끝(도는 점)이 viewBox 오른쪽
     벽에서 3.2/32 만큼 떨어져 있어 36px 기준 약 3.6px 이 이미 비어 있다. 그래서 gap 은 그만큼
     빼고 준다(gap-1=4px + 3.6px = 눈에 약 8px). 심볼 좌표를 바꾸면 이 값도 다시 잡아야 한다. -->
<span class="inline-flex items-center gap-1 leading-none">
  <!-- 심볼: 획 두께를 1em 기준으로 잡지 않고 고정 좌표계로 둔다(크기는 w/h 로만 조절) -->
  <svg
    class={symbolSize}
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <!-- 오른쪽 110도가 열린 링(c). 끝을 둥글게 잘라 입력란, 버튼의 라운드와 결을 맞춘다. -->
    <path
      d="M 21.74 7.81 A 10 10 0 1 0 21.74 24.19"
      stroke-width="3.5"
      stroke-linecap="round"
    />
    <!-- 열린 자리를 도는 점(궤도). 링 중심선 위(반지름 10)에 놓아 링과 한 궤도로 보이게 한다.
         이 좌표가 곧 연출이 끝나는 자리다(위 .orbit-dot 참고) -->
    <circle class="orbit-dot" cx="26" cy="16" r="2.8" fill="currentColor" stroke="none" />
  </svg>

  <!-- 워드마크: 색이 하나뿐인 로고라 CSC 와 universe 를 굵기 + 높이로 가른다.
       높이 차이는 font-size 를 따로 주지 않고 대문자로만 만든다. universe 는 어센더가 없어
       x-height 만 차지하는데 CSC 는 cap-height 를 쓰므로, 폰트가 알아서 1.35배쯤 키워준다.
       (Segoe UI 1.40 / SF Pro 1.35 / Roboto 1.35 / Inter 1.33). 웹폰트 없이 OS 폰트로 렌더되는
       상황이라 임의의 em 값보다 이 편이 어디서나 고르게 나온다. 조절 지점도 전체 크기 하나로 준다.
       두 span 사이에 공백을 두지 않는다(한 단어로 붙어야 한다). 베이스라인은 공유한다. -->
  <span class="wordmark text-3xl tracking-tight">
    <!-- 대문자는 tracking-tight 를 그대로 받으면 답답하다. 이 조각만 자간을 0 으로 되돌린다. -->
    <span class="font-bold tracking-normal">CSC</span><span class="font-normal">universe</span>
  </span>

  <!-- 균형용 빈 자리. 로크업 전체를 가운데 두면 단어가 심볼 폭의 절반만큼 오른쪽으로 밀려 아래 폼의
       중심축과 어긋난다. 심볼과 같은 크기를 반대편에 둬서 로크업을 단어 기준 대칭으로 만들면, 부모는
       평소대로 가운데 정렬만 하면 된다(절대 배치로 심볼을 매다는 방법은 좁은 화면에서 삐져나간다)
       양쪽 gap 도 같은 값이라 이 span 하나로 대칭이 완성된다. -->
  <span class={symbolSize} aria-hidden="true"></span>
</span>
