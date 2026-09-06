/**
 * 생성 진행 화면의 렌더 계약
 *
 * 세그먼트 칸 수는 서버가 입력을 나눈 뒤 정해진다. 그 전에는 격자 대신 로딩 인디케이터와 그 단계의
 * 말을 그려야 한다. 어림한 수로 칸을 그리면 칸 하나가 서 있다가 넷으로 바뀌고, 빈 격자만 두면 멈춘
 * 것으로 읽힌다.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import GenerationProgressView from '$lib/pages/tools/marketing-video/create/GenerationProgressView.svelte';
import type { GenerationProgress } from '$lib/pages/tools/marketing-video/generationProgress';

function progress(over: Partial<GenerationProgress> = {}): GenerationProgress {
  return { stage: 'SPLITTING', startedAt: Date.now(), segments: [], ...over };
}

describe('GenerationProgressView', () => {
  it('칸 수를 모르는 동안 격자 대신 인디케이터와 계산 중 안내를 그린다', () => {
    render(GenerationProgressView, { version: 'v1.5', progress: progress() });

    // 격자 자리: 읽히는 인디케이터 + 그 단계의 말
    expect(screen.getByRole('img', { name: '세그먼트 계산 중' })).toBeInTheDocument();
    expect(screen.getByText(/세그먼트를 계산하는 중입니다/)).toBeInTheDocument();
    // 요약: "0 / 0 완료" 가 아니라 계산 중
    expect(screen.getByText('계산 중')).toBeInTheDocument();
    expect(screen.queryByText(/완료$/)).not.toBeInTheDocument();
    // 어림한 칸은 없다.
    expect(screen.queryByText(/^세그먼트 \d+$/)).not.toBeInTheDocument();
  });

  it('준비 단계의 안내는 나누기와 다르다', () => {
    render(GenerationProgressView, {
      version: 'v1.5',
      progress: progress({ stage: 'PREPARING' }),
    });
    expect(screen.getByText(/영상을 준비하는 중입니다/)).toBeInTheDocument();
    expect(screen.queryByText(/세그먼트를 계산하는 중입니다/)).not.toBeInTheDocument();
  });

  it('칸 수가 정해지면 인디케이터 대신 칸을 한 번에 그리고 완료 수를 센다', () => {
    render(GenerationProgressView, {
      version: 'v1.5',
      progress: progress({
        stage: 'SEGMENT_GENERATING',
        segments: [
          { order: 1, status: 'done', durationSec: 8 },
          { order: 2, status: 'running' },
          { order: 3, status: 'waiting' },
        ],
      }),
    });

    expect(screen.queryByRole('img', { name: '세그먼트 계산 중' })).not.toBeInTheDocument();
    expect(screen.getByText('1 / 3 완료')).toBeInTheDocument();
    for (const n of [1, 2, 3]) expect(screen.getByText(`세그먼트 ${n}`)).toBeInTheDocument();
  });
});
