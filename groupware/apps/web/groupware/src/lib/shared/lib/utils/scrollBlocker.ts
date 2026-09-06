/**
 * 레퍼런스 카운팅 기반 스크롤 차단
 * 여러 모달/오버레이가 동시에 차단을 요청해도 모두 해제될 때까지 리스너 유지
 */
let blockCount = 0;

/**
 * 스크롤 이벤트를 차단합니다.
 * 터치 스크롤과 마우스 휠 모두 차단됩니다.
 */
export function blockScroll(): void {
  blockCount++;

  if (blockCount === 1) {
    // 첫 번째 요청에서만 리스너 등록
    document.addEventListener('wheel', preventScroll, { passive: false });
    document.addEventListener('touchmove', preventTouchScroll, { passive: false });
    document.addEventListener('keydown', preventKeyScroll, { passive: false });
  }
}

/**
 * 스크롤 차단을 해제합니다.
 * 모든 요청자가 해제해야 실제 리스너가 제거됩니다.
 */
export function unblockScroll(): void {
  if (blockCount <= 0) return;

  blockCount--;

  if (blockCount === 0) {
    // 모든 요청이 해제되었을 때만 리스너 제거
    document.removeEventListener('wheel', preventScroll);
    document.removeEventListener('touchmove', preventTouchScroll);
    document.removeEventListener('keydown', preventKeyScroll);
  }
}

/**
 * 스크롤 허용 요소 체크
 */
function isScrollAllowed(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;

  // data-scroll-allowed 속성이 있는 요소 또는 그 자식인지 확인
  return !!target.closest('[data-scroll-allowed="true"]');
}

/**
 * 바텀탭 영역 체크 (모바일에서 바텀탭이 항상 터치 가능하도록)
 */
function isBottomTabArea(e: TouchEvent): boolean {
  const touch = e.touches[0] || e.changedTouches?.[0];
  if (!touch) return false;

  const BOTTOM_TAB_HEIGHT = 56; // h-14 = 56px
  const windowHeight = window.innerHeight;
  const touchY = touch.clientY;

  // 화면 하단 56px 영역은 바텀탭으로 간주하여 터치 허용
  return touchY >= windowHeight - BOTTOM_TAB_HEIGHT;
}

/**
 * 마우스 휠 스크롤 방지
 */
function preventScroll(e: WheelEvent): void {
  if (isScrollAllowed(e.target)) {
    return; // 모달 내부 스크롤 허용
  }

  e.preventDefault();
  e.stopPropagation();
}

/**
 * 터치 스크롤 방지
 */
function preventTouchScroll(e: TouchEvent): void {
  // 바텀탭 영역은 항상 터치 허용
  if (isBottomTabArea(e)) {
    return;
  }

  if (isScrollAllowed(e.target)) {
    return; // 모달 내부 스크롤 허용
  }

  e.preventDefault();
  e.stopPropagation();
}

/**
 * 키보드 스크롤 방지 (방향키, 스페이스바, 페이지 업/다운 등)
 */
function preventKeyScroll(e: KeyboardEvent): void {
  // ESC 키는 항상 허용 (모달 닫기용)
  if (e.key === 'Escape') return;

  if (isScrollAllowed(e.target)) {
    return; // 모달 내부 키보드 이벤트 허용
  }

  // 스크롤을 유발하는 키들
  const scrollKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                     'PageUp', 'PageDown', 'Home', 'End', ' '];

  if (scrollKeys.includes(e.key)) {
    e.preventDefault();
    e.stopPropagation();
  }
}
