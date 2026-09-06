/**
 * 전역 토스트 호스트 렌더 계약 테스트
 *
 * 스토어 규칙(수명/병합)은 unit 에서 고정했다. 여기서는 화면에 실제로 보이는 계약을 지킨다:
 *   - 실패는 즉시 읽히는 role="alert" 로 나온다(스크린리더가 나중에 읽으면 조치가 늦다)
 *   - 색만으로 성격을 구분하지 않는다(스크린리더 라벨 존재)
 *   - 닫기/동작 버튼이 실제로 스토어를 움직인다.
 * 이 계약이 깨지면 알림이 떠도 전달되지 않는다. 조용한 실패라 테스트로 잡는다.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import ToastHost from '$lib/shared/ui/overlays/ToastHost.svelte';
import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';

describe('ToastHost', () => {
  beforeEach(() => {
    toastStore.clear();
  });

  afterEach(() => {
    toastStore.clear();
  });

  it('알림이 없으면 아무것도 렌더하지 않는다. 빈 컨테이너가 클릭을 가로채지 않게', () => {
    render(ToastHost);
    expect(screen.queryByRole('region', { name: '알림' })).not.toBeInTheDocument();
  });

  it('실패는 role=alert + assertive 로 즉시 읽힌다', async () => {
    toastStore.error('원천영상 만들기가 취소되었습니다', '자체 이미지 엔진에 연결할 수 없습니다.');
    render(ToastHost);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent('원천영상 만들기가 취소되었습니다');
    expect(alert).toHaveTextContent('자체 이미지 엔진에 연결할 수 없습니다.');
  });

  it('성공/정보는 role=status + polite 로 방해 없이 읽힌다', async () => {
    toastStore.show({ variant: 'success', title: '저장했습니다' });
    render(ToastHost);

    const status = await screen.findByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('색 외에 스크린리더용 성격 라벨을 함께 제공한다', async () => {
    toastStore.error('실패');
    render(ToastHost);
    expect(await screen.findByText('오류:')).toBeInTheDocument();
  });

  it('닫기 버튼이 그 알림만 걷어낸다', async () => {
    toastStore.error('첫 번째');
    toastStore.error('두 번째');
    render(ToastHost);

    const closeButtons = await screen.findAllByRole('button', { name: '알림 닫기' });
    expect(closeButtons).toHaveLength(2);
    closeButtons[0].click();

    // 화면에서 실제로 사라졌는지 본다(스토어 내부는 unit 테스트가 담당)
    //   runes 반영은 마이크로태스크 뒤라 waitFor 로 정착을 기다린다.
    await waitFor(() => {
      expect(screen.queryByText('첫 번째')).not.toBeInTheDocument();
    });
    expect(screen.getByText('두 번째')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '알림 닫기' })).toHaveLength(1);
  });

  it('동작 버튼은 콜백을 실행하고 알림을 닫는다. 누른 뒤에도 남아 있으면 다시 누르게 된다', async () => {
    const retry = vi.fn();
    toastStore.error('기획서 만들기가 취소되었습니다', undefined, {
      action: { label: '다시 시도', run: retry }
    });
    render(ToastHost);

    (await screen.findByRole('button', { name: '다시 시도' })).click();

    expect(retry).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('같은 사유가 반복되면 횟수를 표시한다', async () => {
    toastStore.error('렌더 실패', '사유', { key: 'same' });
    toastStore.error('렌더 실패', '사유', { key: 'same' });
    render(ToastHost);

    expect(await screen.findByText('2회')).toBeInTheDocument();
  });
});
