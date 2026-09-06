/**
 * 세그먼트 상태 카드의 렌더 계약
 *
 * 격자에는 카드가 열 개 넘게 깔린다. 상태마다 다른 말이 적히지 않으면 그중 하나가 실패해도
 * 훑어보는 눈에 걸리지 않는다. 그리고 재생성 버튼은 눌러서 일이 일어날 때만 있어야 한다.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SegmentStatusCard from '$lib/pages/tools/marketing-video/create/SegmentStatusCard.svelte';

describe('SegmentStatusCard', () => {
  it('완료: 완료 배지와 길이를 보여준다', () => {
    render(SegmentStatusCard, {
      version: 'v1.5',
      segment: { order: 3, status: 'done', durationSec: 8 },
    });
    expect(screen.getByText('세그먼트 3')).toBeInTheDocument();
    expect(screen.getByText('완료')).toBeInTheDocument();
    expect(screen.getByText('00:08')).toBeInTheDocument();
  });

  it('완료 + 주소: 만들어진 영상을 그대로 보여주고 눌러 재생한다', () => {
    // 어느 칸을 다시 만들지는 그 칸이 무엇이 되었는지 봐야 정한다. 결과 영상을 끝까지 보는
    //   것으로는 칸을 가릴 수 없다.
    const { container } = render(SegmentStatusCard, {
      version: 'v1.5',
      segment: { order: 2, status: 'done', durationSec: 8, previewUrl: 'https://x/seg2.mp4' },
    });
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('src', 'https://x/seg2.mp4');
    expect(screen.getByRole('button', { name: '세그먼트 2 재생' })).toBeInTheDocument();
  });

  it('길이는 선언된 값이 우선이다', () => {
    // 파일이 알려 주는 길이는 이 세그먼트의 길이가 아닐 수 있다. 한 파일의 한 구간만 쓰는 경우
    //   `duration` 은 구간이 아니라 파일 전체를 답한다. 선언된 값이 이 세그먼트를 말하는 쪽의 값이다.
    render(SegmentStatusCard, {
      version: 'v1.5',
      segment: {
        order: 1,
        status: 'done',
        durationSec: 2,
        previewUrl: 'https://x/clip.mp4#t=0,2',
      },
    });
    expect(screen.getByText('00:02')).toBeInTheDocument();
  });

  it('완료 + 주소 없음: 영상을 그리지 않고 만들어졌다는 표시만 남긴다', () => {
    // 세그먼트 단위 산출물이 아직 API 로 나오지 않는 경우다. 빈 video 태그를 두면 깨진 재생기가 뜬다.
    const { container } = render(SegmentStatusCard, {
      version: 'v1.5',
      segment: { order: 2, status: 'done', durationSec: 8 },
    });
    expect(container.querySelector('video')).toBeNull();
    expect(screen.queryByRole('button', { name: /재생/ })).not.toBeInTheDocument();
  });

  it('생성 중: 예상 소요를 함께 알린다', () => {
    render(SegmentStatusCard, {
      version: 'v1.5',
      segment: { order: 4, status: 'running', etaSec: 24 },
    });
    expect(screen.getByText('생성중')).toBeInTheDocument();
    expect(screen.getByText('생성 중...')).toBeInTheDocument();
    expect(screen.getByText('예상 소요 약 24초')).toBeInTheDocument();
  });

  it('대기: 대기 배지만 보이고 보조 문구는 없다', () => {
    // 알릴 것이 없을 때 빈 줄을 만들지 않는다(줄 높이만 차지하고 아무 말도 하지 않는다)
    render(SegmentStatusCard, { version: 'v1.5', segment: { order: 7, status: 'waiting' } });
    expect(screen.getByText('대기')).toBeInTheDocument();
    expect(screen.getByText('대기 중')).toBeInTheDocument();
    expect(screen.queryByText(/예상 소요/)).not.toBeInTheDocument();
  });

  it('onRegenerate 가 없으면 재생성 버튼을 그리지 않는다', () => {
    // 눌러도 아무 일 없는 버튼이나 영구 비활성 버튼은 '곧 된다' 는 거짓 약속이 된다.
    render(SegmentStatusCard, {
      version: 'v1.5',
      segment: { order: 5, status: 'done' },
    });
    expect(screen.queryByRole('button', { name: '재생성' })).not.toBeInTheDocument();
  });

  it('onRegenerate 를 주면 완료된 카드에서 눌러 그 세그먼트만 다시 만든다', () => {
    const onRegenerate = vi.fn();
    render(SegmentStatusCard, {
      version: 'v1.5',
      segment: { order: 5, status: 'done' },
      onRegenerate,
    });
    screen.getByRole('button', { name: '재생성' }).click();
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('대기 중인 세그먼트에는 재생성이 없다', () => {
    // 아직 한 번도 만들지 않은 것을 '다시' 만들 수는 없다. 버튼이 있으면 차례를 앞당기는
    //   조작으로 오해된다.
    render(SegmentStatusCard, {
      version: 'v1.5',
      segment: { order: 7, status: 'waiting' },
      onRegenerate: vi.fn(),
    });
    expect(screen.queryByRole('button', { name: '재생성' })).not.toBeInTheDocument();
  });
});
