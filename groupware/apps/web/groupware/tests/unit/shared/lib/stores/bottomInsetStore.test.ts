/**
 * 하단 인셋 스토어 테스트. 하단 고정 오버레이(토스트)가 셸 하단 바를 덮지 않게 하는 계약을 고정한다.
 *
 * 특히 합산과 해제 시 0 복귀가 회귀하면, 바가 둘일 때 토스트가 위 바를 가리거나(합산 실패)
 * 하단 바가 없는 셸(도구 셸)에서 토스트가 허공에 뜬 채로 남는다(해제 실패)
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { bottomInsetStore } from '$lib/shared/lib/stores/viewport/bottomInsetStore/bottomInsetStore.svelte';

describe('bottomInsetStore', () => {
  beforeEach(() => {
    // 싱글톤이라 케이스 간 잔여 등록을 지운다(해제는 없는 id 에도 무해)
    for (const id of ['bar', 'nav', 'a', 'b']) bottomInsetStore.release(id);
  });

  it('등록이 없으면 0 이다. 하단 바가 없는 셸에서는 기존 위치 그대로다', () => {
    expect(bottomInsetStore.px).toBe(0);
  });

  it('등록한 높이를 그대로 돌려준다', () => {
    bottomInsetStore.reserve('bar', 36);
    expect(bottomInsetStore.px).toBe(36);
  });

  it('여러 크롬은 합산한다. 세로로 쌓이므로 최댓값이면 위 바를 덮는다', () => {
    bottomInsetStore.reserve('a', 36);
    bottomInsetStore.reserve('b', 20);
    expect(bottomInsetStore.px).toBe(56);
  });

  it('같은 id 재등록은 누적이 아니라 갱신이다(리사이즈로 높이가 변하는 경우)', () => {
    bottomInsetStore.reserve('bar', 36);
    bottomInsetStore.reserve('bar', 72);
    expect(bottomInsetStore.px).toBe(72);
  });

  it('해제하면 그만큼 줄고, 전부 해제하면 0 으로 돌아간다', () => {
    bottomInsetStore.reserve('a', 36);
    bottomInsetStore.reserve('b', 20);

    bottomInsetStore.release('b');
    expect(bottomInsetStore.px).toBe(36);

    bottomInsetStore.release('a');
    expect(bottomInsetStore.px).toBe(0);
  });

  it('없는 id 해제는 무해하다. 언마운트 순서에 의존하지 않는다', () => {
    bottomInsetStore.reserve('bar', 36);
    bottomInsetStore.release('없는-id');
    expect(bottomInsetStore.px).toBe(36);
  });
});
