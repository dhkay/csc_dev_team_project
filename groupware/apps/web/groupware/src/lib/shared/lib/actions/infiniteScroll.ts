/**
 * 목록 끝에 둔 센티넬이 보이면 다음 페이지를 불러오는 액션(`use:infiniteScroll`)
 *
 * 목록 컴포넌트마다 IntersectionObserver 를 직접 만들면 미지원 환경 처리와 로드 중 중복 요청
 * 방지와 재관측 문제가 조용히 갈린다. 그래서 한곳에 모은다.
 *
 * 자동 로드는 편의 기능이다. 관측이 불가능한 환경에서는 조용히 아무것도 하지 않고, 목록을
 * 끝까지 볼 수 있는 책임은 호출부의 더 보기 버튼에 남겨 둔다. 키보드와 보조기술 사용자에게도
 * 그 경로가 필요하다.
 */

/** 센티넬이 화면에 닿기 전에 미리 당겨오는 거리. 스크롤이 끊기지 않을 만큼만 */
const DEFAULT_ROOT_MARGIN = '0px 0px 200px 0px';

export interface InfiniteScrollOptions {
  // 스크롤 컨테이너. 생략(또는 undefined)하면 뷰포트 기준이다.
  // `bind:this` 로 받은 값이 첫 렌더에 아직 없을 수 있어 undefined 를 정상으로 다룬다.
  root?: HTMLElement | null;
  // 더 가져올 페이지가 있는가. false 면 교차해도 부르지 않는다.
  hasMore: boolean;
  // 지금 가져오는 중인가. 스크롤 한 번에 같은 페이지를 여러 번 요청하지 않게 막는다.
  busy: boolean;
  // 다음 페이지 로드
  load: () => void;
  // 미리 당겨오는 거리 override.
  rootMargin?: string;
}

export function infiniteScroll(element: HTMLElement, options: InfiniteScrollOptions) {
  let current = options;

  if (typeof IntersectionObserver === 'undefined') {
    // 미지원 환경: 관측만 포기하고 update/destroy 계약은 지킨다(호출부가 분기하지 않게)
    return {
      update(next: InfiniteScrollOptions) {
        current = next;
      },
      destroy() {},
    };
  }

  let observer: IntersectionObserver | undefined;

  const onIntersect = (entries: IntersectionObserverEntry[]): void => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    if (!current.hasMore || current.busy) return;
    current.load();
  };

  /** root/rootMargin 은 생성자 인자라 바뀌면 옵저버를 새로 만들어야 한다. */
  const connect = (): void => {
    observer?.disconnect();
    observer = new IntersectionObserver(onIntersect, {
      root: current.root ?? null,
      rootMargin: current.rootMargin ?? DEFAULT_ROOT_MARGIN,
    });
    observer.observe(element);
  };

  connect();

  return {
    update(next: InfiniteScrollOptions) {
      const previous = current;
      current = next;

      if (next.root !== previous.root || next.rootMargin !== previous.rootMargin) {
        connect();
        return;
      }

      // 로드가 막 끝난 순간(busy: true → false)에는 관측을 재시작한다.
      //
      // 센티넬이 계속 화면 안에 머물러 있으면 새 교차 이벤트가 오지 않아 거기서 멈춘다.
      // 한 페이지가 화면을 다 못 채울 때(창이 크거나 행이 적을 때) 실제로 일어나고,
      // 증상은 "스크롤이 안 되니 더 이상 안 불러온다"라서 원인을 찾기 어렵다.
      if (previous.busy && !next.busy && next.hasMore) {
        observer?.unobserve(element);
        observer?.observe(element);
      }
    },
    destroy() {
      observer?.disconnect();
    },
  };
}
