/**
 * 하단 탭 바의 렌더 계약
 *
 * 이 줄은 셸의 in-flow 행이라 존재만으로 본문 높이를 가져간다. 그래서 담을 것이 없을 때 사라지는
 * 것이 계약의 절반이고, 눌러서 그 항목이 열리는 것이 나머지 절반이다. 둘 중 하나가 깨지면 화면이
 * 조용히 좁아지거나, 돌고 있는 일로 돌아갈 길이 막힌다.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import BottomTabBar from '$lib/shared/ui/navigation/BottomTabBar.svelte';

const LABEL = '진행 중인 작업';

describe('BottomTabBar', () => {
  it('항목이 없으면 아무것도 렌더하지 않는다', () => {
    // 빈 줄이 남으면 담을 것이 없는데도 본문이 늘 그만큼 좁아진다.
    render(BottomTabBar, { items: [], onSelect: vi.fn(), label: LABEL });
    expect(screen.queryByRole('navigation', { name: LABEL })).not.toBeInTheDocument();
  });

  it('항목을 누르면 그 id 를 돌려준다', () => {
    const onSelect = vi.fn();
    render(BottomTabBar, {
      items: [{ id: 'generation:7', label: '정관장' }],
      onSelect,
      label: LABEL,
    });

    screen.getByRole('button', { name: '정관장' }).click();
    expect(onSelect).toHaveBeenCalledWith('generation:7');
  });

  it('열려 있는 탭만 활성으로 표시한다', () => {
    render(BottomTabBar, {
      items: [
        { id: 'a', label: '첫째' },
        { id: 'b', label: '둘째' },
      ],
      activeId: 'b',
      onSelect: vi.fn(),
      label: LABEL,
    });

    expect(screen.getByRole('button', { name: '둘째' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: '첫째' })).not.toHaveAttribute('aria-current');
  });

  it('닫기는 그 자리에서 끝낼 수 있는 항목에만 그린다', () => {
    // 돌고 있는 유료 생성을 이 줄에서 한 번에 끊게 하지 않는다. 되돌릴 수 없는 조작이라
    // 확인을 거치는 자리(창 안의 '생성 취소')가 따로 있다.
    const onClose = vi.fn();
    render(BottomTabBar, {
      items: [
        { id: 'draft', label: '겨울 신제품', closable: true },
        { id: 'batch:1', label: '정관장', busy: true },
      ],
      onSelect: vi.fn(),
      onClose,
      label: LABEL,
    });

    expect(screen.queryByRole('button', { name: '정관장 닫기' })).not.toBeInTheDocument();
    screen.getByRole('button', { name: '겨울 신제품 닫기' }).click();
    expect(onClose).toHaveBeenCalledWith('draft');
  });

  it('닫기 처리를 주지 않으면 아무 항목에도 그리지 않는다', () => {
    render(BottomTabBar, {
      items: [{ id: 'draft', label: '겨울 신제품', closable: true }],
      onSelect: vi.fn(),
      label: LABEL,
    });
    expect(screen.queryByRole('button', { name: '겨울 신제품 닫기' })).not.toBeInTheDocument();
  });

  it('닫기를 눌러도 그 탭이 열리지 않는다', () => {
    // 한 칩 안에 동작이 둘이다. 버리려던 사람이 창을 마주하면 실수한 줄 알고 다시 닫는다.
    const onSelect = vi.fn();
    render(BottomTabBar, {
      items: [{ id: 'draft', label: '겨울 신제품', closable: true }],
      onSelect,
      onClose: vi.fn(),
      label: LABEL,
    });

    screen.getByRole('button', { name: '겨울 신제품 닫기' }).click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('배지와 전체 설명을 함께 싣는다', () => {
    // 라벨은 좁아 잘린다. 원문이 title 에 없으면 무엇을 만드는 중인지 확인할 방법이 없다.
    render(BottomTabBar, {
      items: [{ id: 'a', label: '아주 긴 이름', badge: '42%', title: '아주 긴 이름 (세그먼트 생성)' }],
      onSelect: vi.fn(),
      label: LABEL,
    });

    const tab = screen.getByRole('button', { name: /아주 긴 이름/ });
    expect(tab).toHaveAttribute('title', '아주 긴 이름 (세그먼트 생성)');
    expect(tab).toHaveTextContent('42%');
  });
});
