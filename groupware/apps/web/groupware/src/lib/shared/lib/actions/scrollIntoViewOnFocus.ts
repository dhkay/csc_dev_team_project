/**
 * 포커스 시 입력란을 화면 중앙으로 스크롤하는 액션
 *
 * 모바일 브라우저는 키보드에 가려지는 input(주로 화면 하단)에만 자동 스크롤을 트리거하므로,
 * 화면 상단 input(예: 이메일/아이디)은 보정이 필요하다. focus 시 키보드 애니메이션 시간만큼
 * 대기한 뒤 scrollIntoView 를 호출하고, blur, destroy 시 타이머를 정리해 누수를 방지한다.
 */
interface ScrollIntoViewOnFocusOptions {
  // 키보드 애니메이션 대기 시간(ms). 기본 300
  delay?: number;
  // scrollIntoView block 옵션. 기본 'center'
  block?: ScrollLogicalPosition;
}

export function scrollIntoViewOnFocus(
  element: HTMLElement,
  options: ScrollIntoViewOnFocusOptions = {},
) {
  let { delay = 300, block = 'center' } = options;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function clearTimer() {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function handleFocus() {
    clearTimer();
    timer = setTimeout(() => {
      element.scrollIntoView({ block, behavior: 'smooth' });
      timer = undefined;
    }, delay);
  }

  element.addEventListener('focus', handleFocus);
  element.addEventListener('blur', clearTimer);

  return {
    update(next: ScrollIntoViewOnFocusOptions = {}) {
      delay = next.delay ?? 300;
      block = next.block ?? 'center';
    },
    destroy() {
      element.removeEventListener('focus', handleFocus);
      element.removeEventListener('blur', clearTimer);
      clearTimer();
    },
  };
}