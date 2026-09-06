/**
 * 알림을 띄우는 일이 부르는 쪽을 다시 실행시키면 안 된다.
 *
 * 어기면 화면에 "만들기가 취소되었습니다 1000회" 처럼 뜬다. 통보가 천 번 온 것이 아니라
 * `$effect` 가 천 번 돈 것이다. 스토어의 `show()` 가 목록을 읽고
 * (같은 key 를 찾으려고) 그 다음 쓰는데, 그 읽기가 부르는 쪽 effect 의 의존성으로 잡혀
 * 쓰기가 곧 그 effect 를 다시 깨웠다. 스벨트의 순환 방지 한도(1000)에서 멈춘 숫자가 그것이다.
 *
 * 취소가 없는 틱에서는 드러나지 않는다. 그때는 통보 함수가 빈 배열을 받아 스토어를 건드리지
 * 않기 때문이다. 그래서 이 결함은 실패가 실제로 일어난 날에만 나타난다.
 *
 * 아래 두 단정이 그 계약을 잠근다. 호출부마다 `untrack` 을 기억하는 방식은 잊는 곳이 남으므로
 * 스토어가 자기 읽기를 가둔다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';

describe('toastStore 를 $effect 안에서 부를 때', () => {
  beforeEach(() => {
    toastStore.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    toastStore.clear();
    vi.useRealTimers();
  });

  it('같은 알림을 띄우는 effect 가 자기 쓰기로 다시 실행되지 않는다', () => {
    let runs = 0;
    const cleanup = $effect.root(() => {
      $effect(() => {
        runs += 1;
        toastStore.error('원천영상 만들기가 취소되었습니다', '모델이 사용 중지되었습니다', {
          key: 'render-cancelled:원천영상:16',
        });
      });
    });
    flushSync();

    // effect 는 한 번 돈다. 스토어 쓰기가 그것을 다시 깨우면 여기서 수십, 수백이 된다.
    expect(runs).toBe(1);
    // 그리고 알림은 하나, 횟수도 1 이다(같은 실패를 천 번 세지 않는다)
    expect(toastStore.items).toHaveLength(1);
    expect(toastStore.items[0].count).toBe(1);
    cleanup();
  });

  it('알림 목록을 그리는 쪽은 여전히 갱신을 본다', () => {
    // 위 격리가 과하면 이것이 깨진다. 호스트가 새 알림을 못 보면 실패가 조용해진다.
    const seen: number[] = [];
    const cleanup = $effect.root(() => {
      $effect(() => {
        seen.push(toastStore.items.length);
      });
    });
    flushSync();
    toastStore.error('첫 번째', undefined, { key: 'a' });
    flushSync();
    toastStore.error('두 번째', undefined, { key: 'b' });
    flushSync();

    expect(seen).toEqual([0, 1, 2]);
    cleanup();
  });
});
