/**
 * 이미지 페이드 등장 액션 잠금
 *
 * 여기서 지키는 것은 "언제 투명하게 만들지 않는가"가 대부분이다. 이 액션은 장식이라, 잘못
 * 동작했을 때의 대가가 연출이 없는 것(작은 손해)이 아니라 사진이 안 보이는 것(큰 손해)이다.
 * 그래서 캐시된 사진, 로드 실패, 모션 최소화 각각에서 끝 상태가 '보이는 것'인지를 확인한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fadeInOnLoad } from '$lib/shared/lib/actions/fadeInOnLoad';

/** 등록된 리스너를 기억해 두고 테스트가 load/error 를 흉내 낼 수 있는 이미지 대역 */
interface FakeImage extends HTMLImageElement {
  fire(type: 'load' | 'error'): void;
  listenerCount(type: 'load' | 'error'): number;
}

function stubImage(complete = false): FakeImage {
  const listeners = new Map<string, Set<EventListener>>();

  const image = {
    complete,
    style: {} as CSSStyleDeclaration,
    addEventListener(type: string, listener: EventListener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(listener);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener);
    },
    fire(type: 'load' | 'error') {
      for (const listener of listeners.get(type) ?? []) listener(new Event(type));
    },
    listenerCount(type: 'load' | 'error') {
      return listeners.get(type)?.size ?? 0;
    },
  };

  return image as unknown as FakeImage;
}

/** 모션 최소화 설정 대역 */
function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({ matches: reduce && query.includes('reduce') }),
  });
}

describe('fadeInOnLoad', () => {
  beforeEach(() => {
    stubReducedMotion(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('아직 로드되지 않은 사진은 투명하게 시작한다', () => {
    const image = stubImage();

    fadeInOnLoad(image);

    expect(image.style.opacity).toBe('0');
  });

  it('사진이 도착하면 페이드로 드러난다', () => {
    const image = stubImage();
    fadeInOnLoad(image);

    image.fire('load');

    expect(image.style.opacity).toBe('1');
    expect(image.style.transition).toContain('opacity');
  });

  it('이미 캐시에서 온 사진은 건드리지 않는다', () => {
    // 다 그려진 사진을 투명하게 만들었다가 되돌리면 없던 깜빡임을 만든다(두 번째 방문)
    const image = stubImage(true);

    fadeInOnLoad(image);

    expect(image.style.opacity).toBeUndefined();
    expect(image.listenerCount('load')).toBe(0);
  });

  it('모션 최소화 설정에서는 아무것도 하지 않는다', () => {
    stubReducedMotion(true);
    const image = stubImage();

    fadeInOnLoad(image);

    expect(image.style.opacity).toBeUndefined();
    expect(image.listenerCount('load')).toBe(0);
  });

  it('로드에 실패해도 사진 자리를 숨겨 두지 않는다', () => {
    // 투명한 채로 남으면 깨진 사진조차 안 보여서, 빈 칸의 원인을 찾을 단서가 사라진다.
    const image = stubImage();
    fadeInOnLoad(image);

    image.fire('error');

    expect(image.style.opacity).toBe('1');
  });

  it('matchMedia 가 없는 환경에서도 터지지 않는다', () => {
    vi.stubGlobal('window', {});
    const image = stubImage();

    expect(() => fadeInOnLoad(image)).not.toThrow();
    expect(image.style.opacity).toBe('0');
  });

  it('destroy 하면 리스너를 걷어낸다', () => {
    const image = stubImage();
    const action = fadeInOnLoad(image);

    action.destroy();

    expect(image.listenerCount('load')).toBe(0);
    expect(image.listenerCount('error')).toBe(0);
  });
});
