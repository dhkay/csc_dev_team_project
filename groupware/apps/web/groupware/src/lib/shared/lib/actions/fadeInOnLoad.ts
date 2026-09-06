/**
 * 사진이 실제로 도착한 순간 부드럽게 나타내는 액션(`use:fadeInOnLoad`)
 *
 * CSS 애니메이션은 요소가 만들어질 때 시작한다. 사진은 그보다 늦게 도착하므로 애니메이션은 빈
 * 자리에서 혼자 끝나고 사진은 그 뒤에 툭 나타난다. 나타나는 시점을 알려 주는 것은 load 이벤트뿐이다.
 *
 * 세 가지를 지킨다.
 *
 * 1. 기본 상태는 보이는 것이다. 투명은 이 액션이 실행될 때만 준다. CSS 에 `opacity: 0` 을 깔면
 *    스크립트가 죽거나 하이드레이션이 실패한 순간 사진이 영구히 사라진다.
 * 2. 이미 캐시에서 온 사진은 건드리지 않는다(`complete`). 없던 깜빡임을 만드는 셈이 된다.
 * 3. 실패해도 숨기지 않는다. error 에서도 투명을 되돌린다.
 *
 * 모션 최소화 설정에서는 아무것도 하지 않는다.
 */

/**
 * 페이드 길이. 등장을 눈으로 따라갈 수 있으면서 로그인 흐름을 붙잡지 않는 정도
 * 호출부마다 다르게 줄 이유가 생기면 그때 옵션으로 열면 된다(지금은 부르는 곳이 한 값만 쓴다)
 */
const DURATION_MS = 400;

export function fadeInOnLoad(image: HTMLImageElement) {
  // 이미 도착했거나(캐시) 사용자가 모션을 원하지 않으면 손대지 않는다. 위 2번, 그리고 이 액션이
  // 하는 일은 전부 장식이라 빠져도 화면은 완성된 상태다.
  if (image.complete || prefersReducedMotion()) {
    return { destroy() {} };
  }

  image.style.opacity = '0';

  const reveal = (): void => {
    // transition 은 값이 바뀌는 시점에 붙어 있으면 된다. 시작값(0)은 이미 이전 프레임에
    // 계산되어 있으므로 여기서 둘을 함께 설정해도 0 에서 1 로 이어진다.
    image.style.transition = `opacity ${DURATION_MS}ms ease-out`;
    image.style.opacity = '1';
  };

  image.addEventListener('load', reveal, { once: true });
  image.addEventListener('error', reveal, { once: true });

  return {
    destroy() {
      image.removeEventListener('load', reveal);
      image.removeEventListener('error', reveal);
    },
  };
}

/**
 * 모션 최소화 요청 여부
 *
 * matchMedia 가 없는 환경(테스트 대역 등)에서는 '요청 없음'으로 본다. 연출을 하되 터지지 않는
 * 쪽이, 연출을 건너뛰되 예외로 렌더를 깨는 쪽보다 안전하다.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
