/**
 * component 테스트 setup: vite.config.ts 의 `component` 프로젝트가 로드한다.
 *
 * 1) jest-dom 매처(toBeInTheDocument/toHaveAttribute 등)를 vitest 의 expect 에 등록한다.
 *    DOM 정리(cleanup)는 `svelteTesting()` 플러그인이 각 테스트 후 자동 수행하므로 여기서 하지 않는다.
 *
 * 2) `window.matchMedia` 스텁: jsdom 이 구현하지 않는데 themeStore 가 생성 시점에 호출한다.
 *    (시스템 다크 선호 추적). 테마를 쓰는 컴포넌트는 사실상 전부 이 경로를 타므로 개별 테스트가 아니라
 *    여기서 한 번 채운다. 기본은 라이트(matches=false): 테마별 렌더를 검증하려면 그 테스트에서 덮어쓴다.
 */
import '@testing-library/jest-dom/vitest';

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {}, // 구 API: 일부 라이브러리가 아직 본다
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}
