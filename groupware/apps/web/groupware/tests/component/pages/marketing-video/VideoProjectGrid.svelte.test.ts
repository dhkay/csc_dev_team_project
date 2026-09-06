/**
 * 카드의 그림을 어디에 쓰는가
 *
 * 이 그리드는 두 종류의 그림을 그린다. 사람이 만든 썸네일(프레임을 고르고 문구를 얹은 배포용
 * 그림)과, 자동으로 뽑힌 첫 씬 이미지다. `thumbnailPreview` 가 어느 쪽인지 말해 주고, 그 값에 따라
 * 두 가지가 갈린다.
 *
 *   1. 따로 열어 보는 버튼: 사람이 만든 그림만 크게 보고 받아 갈 대상이다.
 *   2. 영상의 poster: 사람이 만든 그림은 얹지 않는다. 얹으면 그 그림이 영상의 첫 화면처럼
 *      보여 영상에 들어간 것으로 읽힌다. 실제로는 별개 파일이고 배포처에 올릴 때만 쓰인다.
 *      첫 씬 이미지는 영상에서 나온 한 컷이라 그대로 poster 로 남는다.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import VideoProjectGrid from '$lib/pages/tools/marketing-video/shared/VideoProjectGrid.svelte';
import type { VideoCard } from '$lib/features/marketing-channels/types';

const CARD: VideoCard = {
  id: 1,
  title: '완성 영상',
  aspectRatio: '9:16',
  renderStatus: 'COMPLETED',
  progress: null,
  resultUrl: 'https://files.example/files/v1',
  thumbnailUrl: 'https://files.example/files/t1',
  error: null,
};

function mount(props: Partial<Parameters<typeof render>[1]> = {}) {
  return render(VideoProjectGrid, { projects: [CARD], ...props });
}

/** 카드의 재생 요소. 완성본은 인라인 재생이라 항상 하나다. */
function video(container: HTMLElement): HTMLVideoElement {
  const el = container.querySelector('video');
  if (!el) throw new Error('완성본 카드에 video 가 없습니다.');
  return el as HTMLVideoElement;
}

describe('VideoProjectGrid 썸네일 보기', () => {
  it('켠 자리에서는 카드에 썸네일 버튼이 있다', () => {
    mount({ thumbnailPreview: true });
    expect(screen.getByRole('button', { name: '썸네일' })).toBeTruthy();
  });

  it('끈 자리에서는 없다(원천 영상의 첫 씬 이미지는 열어 볼 대상이 아니다)', () => {
    mount();
    expect(screen.queryByRole('button', { name: '썸네일' })).toBeNull();
  });

  it('그림이 없는 카드에는 버튼을 그리지 않는다', () => {
    // 세트로 만든 최종본에는 썸네일이 없다. 눌러도 아무것도 열리지 않는 버튼을 두지 않는다.
    render(VideoProjectGrid, {
      projects: [{ ...CARD, thumbnailUrl: null }],
      thumbnailPreview: true,
    });
    expect(screen.queryByRole('button', { name: '썸네일' })).toBeNull();
  });
});

describe('사람이 만든 썸네일은 영상에 얹지 않는다', () => {
  it('켠 자리에서는 poster 가 비어 있다(영상 자기 화면이 나온다)', () => {
    const { container } = mount({ thumbnailPreview: true });
    // 얹으면 그 그림이 영상의 첫 화면처럼 보여, 별개 파일인 것이 화면에서 사라진다.
    expect(video(container).getAttribute('poster')).toBeNull();
  });

  it('끈 자리에서는 그림이 poster 로 남는다(첫 씬 이미지는 영상의 한 컷이다)', () => {
    const { container } = mount();
    expect(video(container).getAttribute('poster')).toBe(CARD.thumbnailUrl);
  });
});
