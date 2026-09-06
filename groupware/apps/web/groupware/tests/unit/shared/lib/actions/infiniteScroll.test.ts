/**
 * 무한 스크롤 액션 잠금
 *
 * 여기서 지키는 것은 "언제 부르지 않는가"가 대부분이다. 잘못 부르면 같은 페이지를 여러 번
 * 요청하거나(중복 행), 미지원 환경에서 터져 목록 전체가 렌더되지 않는다. 자동 로드는 편의
 * 기능이라 실패하더라도 조용해야 하고, 끝까지 보는 책임은 호출부의 버튼에 남아 있다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { infiniteScroll } from '$lib/shared/lib/actions/infiniteScroll';

/** 관측 대상을 기억해 두고, 테스트가 원할 때 교차를 흉내 낼 수 있는 대역 */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  observed: Element[] = [];
  disconnected = false;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.push(target);
  }

  unobserve(target: Element): void {
    this.observed = this.observed.filter((el) => el !== target);
  }

  disconnect(): void {
    this.disconnected = true;
    this.observed = [];
  }

  /** 센티넬이 화면에 들어온 상황 */
  enter(): void {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
  }

  /** 화면 밖으로 나간 상황 */
  leave(): void {
    this.callback([{ isIntersecting: false } as IntersectionObserverEntry], this as never);
  }
}

const latest = (): FakeIntersectionObserver =>
  FakeIntersectionObserver.instances[FakeIntersectionObserver.instances.length - 1];

/**
 * 요소 대역. 액션은 요소를 옵저버에 넘기기만 하고 DOM API 를 건드리지 않으므로 빈 객체면
 * 충분하다(덕분에 이 테스트가 jsdom 없이 node 환경에서 돈다)
 */
const stubElement = (): HTMLElement => ({}) as HTMLElement;

describe('infiniteScroll', () => {
  let element: HTMLElement;

  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    element = stubElement();
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('센티넬이 보이면 다음 페이지를 부른다', () => {
    const load = vi.fn();
    infiniteScroll(element, { hasMore: true, busy: false, load });

    latest().enter();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('화면 밖으로 나가는 것만으로는 부르지 않는다', () => {
    const load = vi.fn();
    infiniteScroll(element, { hasMore: true, busy: false, load });

    latest().leave();

    expect(load).not.toHaveBeenCalled();
  });

  it('가져오는 중이면 부르지 않는다', () => {
    // 스크롤 한 번에 교차 이벤트가 여러 번 올 수 있다. 막지 않으면 같은 커서로 여러 페이지를
    // 요청해 같은 행이 중복으로 붙는다.
    const load = vi.fn();
    infiniteScroll(element, { hasMore: true, busy: true, load });

    latest().enter();

    expect(load).not.toHaveBeenCalled();
  });

  it('더 가져올 페이지가 없으면 부르지 않는다', () => {
    const load = vi.fn();
    infiniteScroll(element, { hasMore: false, busy: false, load });

    latest().enter();

    expect(load).not.toHaveBeenCalled();
  });

  it('갱신된 콜백과 상태를 쓴다(생성 시점 값에 갇히지 않는다)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const action = infiniteScroll(element, { hasMore: false, busy: false, load: first });

    action.update({ hasMore: true, busy: false, load: second });
    latest().enter();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('로드가 끝나면 관측을 재시작한다', () => {
    // 센티넬이 계속 화면 안에 있으면 새 교차 이벤트가 오지 않아 거기서 멈춘다(첫 페이지가
    // 화면을 다 못 채울 때). 재관측이 빠지면 증상은 "스크롤이 안 되니 더 안 불러온다"다
    const load = vi.fn();
    const action = infiniteScroll(element, { hasMore: true, busy: true, load });
    const observer = latest();
    observer.observed = [];

    action.update({ hasMore: true, busy: false, load });

    expect(observer.observed).toContain(element);
  });

  it('마지막 페이지까지 왔으면 재관측하지 않는다', () => {
    const load = vi.fn();
    const action = infiniteScroll(element, { hasMore: true, busy: true, load });
    const observer = latest();
    observer.observed = [];

    action.update({ hasMore: false, busy: false, load });

    expect(observer.observed).toHaveLength(0);
  });

  it('스크롤 컨테이너가 뒤늦게 붙으면 옵저버를 다시 만든다', () => {
    // `bind:this` 로 받는 root 는 첫 렌더에 아직 없을 수 있다. root 는 생성자 인자라
    // 새로 만들지 않으면 계속 뷰포트를 기준으로 관측해 엉뚱한 시점에 로드된다.
    const load = vi.fn();
    const action = infiniteScroll(element, { hasMore: true, busy: false, load });
    expect(latest().options?.root).toBeNull();

    const root = stubElement();
    action.update({ root, hasMore: true, busy: false, load });

    expect(FakeIntersectionObserver.instances).toHaveLength(2);
    expect(latest().options?.root).toBe(root);
    expect(latest().observed).toContain(element);
  });

  it('destroy 하면 관측을 끊는다', () => {
    const action = infiniteScroll(element, { hasMore: true, busy: false, load: vi.fn() });
    action.destroy();
    expect(latest().disconnected).toBe(true);
  });

  it('IntersectionObserver 가 없는 환경에서도 터지지 않는다', () => {
    // 자동 로드는 편의 기능이다. 없다고 목록 렌더가 깨지면 안 된다(호출부의 버튼은 그대로 동작)
    vi.stubGlobal('IntersectionObserver', undefined);
    const load = vi.fn();

    const action = infiniteScroll(element, { hasMore: true, busy: false, load });
    action.update({ hasMore: true, busy: false, load });
    action.destroy();

    expect(load).not.toHaveBeenCalled();
  });
});
