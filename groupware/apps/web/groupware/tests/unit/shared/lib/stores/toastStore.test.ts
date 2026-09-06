/**
 * 전역 토스트 스토어 테스트: 표시 규칙(수명, 개수 상한, 중복 병합)이 스토어에 있으므로 여기서 고정한다.
 *
 * 특히 중복 병합과 실패는 자동 소멸 없음이 회귀하면 화면이 도배되거나, 사용자가 조치를 읽기
 * 전에 사유가 사라진다. 둘 다 폴링 경로(영상 렌더 취소 감시)가 의존하는 성질이다.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';
import { TOAST_MAX_VISIBLE } from '$lib/shared/lib/stores/toastStore/toast.types';

describe('toastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toastStore.clear();
  });

  afterEach(() => {
    toastStore.clear();
    vi.useRealTimers();
  });

  it('info 는 시간이 지나면 자동으로 사라진다', () => {
    toastStore.show({ variant: 'info', title: '저장했습니다' });
    expect(toastStore.items).toHaveLength(1);

    vi.advanceTimersByTime(6_000);
    expect(toastStore.items).toHaveLength(0);
  });

  it('실패는 자동으로 사라지지 않는다. 사용자가 사유를 읽고 조치해야 한다', () => {
    toastStore.error('영상 만들기 취소', '자체 이미지 엔진에 연결할 수 없습니다.');

    vi.advanceTimersByTime(60_000);
    expect(toastStore.items).toHaveLength(1);
    expect(toastStore.items[0].variant).toBe('error');
  });

  it('같은 key 는 쌓지 않고 갱신하며 횟수를 센다. 폴링이 같은 실패를 반복 보고해도 도배되지 않는다', () => {
    toastStore.error('렌더 실패', '첫 번째 사유', { key: 'render:42' });
    toastStore.error('렌더 실패', '갱신된 사유', { key: 'render:42' });
    toastStore.error('렌더 실패', '또 갱신', { key: 'render:42' });

    expect(toastStore.items).toHaveLength(1);
    expect(toastStore.items[0].count).toBe(3);
    expect(toastStore.items[0].detail).toBe('또 갱신');
  });

  it('key 미지정이면 variant + 제목으로 병합한다', () => {
    toastStore.show({ variant: 'warning', title: '같은 제목' });
    toastStore.show({ variant: 'warning', title: '같은 제목' });
    expect(toastStore.items).toHaveLength(1);

    // 다른 variant 면 다른 알림이다(성격이 다르므로 합치지 않는다)
    toastStore.error('같은 제목');
    expect(toastStore.items).toHaveLength(2);
  });

  it('상한을 넘으면 가장 오래된 것을 밀어낸다. 새 알림이 항상 보이게', () => {
    for (let i = 0; i < TOAST_MAX_VISIBLE + 2; i += 1) {
      toastStore.error(`실패 ${i}`);
    }
    expect(toastStore.items).toHaveLength(TOAST_MAX_VISIBLE);
    // 앞의 두 개가 밀려났다.
    expect(toastStore.items[0].title).toBe('실패 2');
  });

  it('동작 버튼이 붙은 알림은 마지막에 밀려난다. 복구 수단이 잡음에 지워지지 않게', () => {
    // 배포 중 실패가 몰리는 상황: 저장 실패('다시 저장')가 먼저 뜨고 그 뒤로 잡음이 쌓인다.
    //   단순히 오래된 것부터 지우면 유일한 복구 수단이 사라진다(이미지는 브라우저 메모리에만 있다)
    const recoverable = toastStore.error('기획안 저장 실패', undefined, {
      action: { label: '다시 저장', run: () => {} },
    });
    for (let i = 0; i < TOAST_MAX_VISIBLE + 2; i += 1) toastStore.error(`잡음 ${i}`);

    expect(toastStore.items).toHaveLength(TOAST_MAX_VISIBLE);
    expect(toastStore.items.some((t) => t.id === recoverable)).toBe(true);
    expect(toastStore.items[0].action?.label).toBe('다시 저장');
  });

  it('show 가 돌려준 id 로 그 알림만 닫을 수 있다', () => {
    const id = toastStore.error('엔진 혼잡', undefined, { key: 'engine-busy' });
    toastStore.error('다른 실패');

    toastStore.dismiss(id);
    expect(toastStore.items).toHaveLength(1);
    expect(toastStore.items[0].title).toBe('다른 실패');
  });

  it('hover 중에는 자동 소멸이 멈추고, 벗어나면 다시 시작한다', () => {
    toastStore.show({ variant: 'success', title: '완료' }); // 기본 4초
    toastStore.pauseAutoDismiss();

    vi.advanceTimersByTime(10_000);
    expect(toastStore.items).toHaveLength(1); // 읽는 중엔 사라지지 않는다

    toastStore.resumeAutoDismiss();
    vi.advanceTimersByTime(4_000);
    expect(toastStore.items).toHaveLength(0);
  });

  it('durationMs=0 은 수동으로만 닫힌다', () => {
    const id = toastStore.show({ variant: 'info', title: '계속 떠 있어야 함', durationMs: 0 });
    vi.advanceTimersByTime(60_000);
    expect(toastStore.items).toHaveLength(1);

    toastStore.dismiss(id);
    expect(toastStore.items).toHaveLength(0);
  });
});
