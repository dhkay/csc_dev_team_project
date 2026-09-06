/**
 * 생성 중 배치의 마운트와 표시는 다른 문제다.
 *
 * 기획안 구역이 없는 버전(v1.5)은 완성 전까지 워크스페이스에 아무것도 보여주지 않는다. 그래도 이
 * 컴포넌트는 마운트되어야 한다: 자동 저장을 굴리는 것이 여기고(onProposalComplete), 저장이 없으면
 * 영상이 만들어지지 않는다. '돌지만 그리지 않는' 상태가 그 버전의 정상이다.
 *
 * 눈으로는 안 잡힌다. 잘못 그려도 화면은 멀쩡하고, 반대로 마운트를 빼면 화면은 깨끗한데 영상이
 * 영영 만들어지지 않는다(그쪽은 아무 오류도 남기지 않는다)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import PlanBatch from '$lib/pages/tools/marketing-video/workspace/PlanBatch.svelte';
import type { PlanProposal } from '$lib/features/marketing-channels/types';

// 생성 쿼리의 상태를 테스트가 정한다. 기본은 텍스트 기획안이 도착하기 전(누른 직후, 사람이 실제로
//   보는 순간)이고, 도착 후를 보는 테스트만 `queryState` 를 갈아 끼운다.
let queryState: Record<string, unknown> = {
  data: undefined,
  isSuccess: false,
  isError: false,
  isFetching: true,
};
vi.mock('@tanstack/svelte-query', () => ({
  createQuery: () => queryState,
  useQueryClient: () => ({}),
}));

// 실패한 배치를 걷는 사가. 실제로 돌리지 않고 불렸는지만 본다(그 사가 자체는 자기 스펙이 잠근다)
const cancelGeneratingBatch = vi.fn(async (..._args: unknown[]): Promise<boolean> => true);
vi.mock('$lib/features/marketing-channels/lib/cancelGeneratingBatch', () => ({
  cancelGeneratingBatch: (...args: unknown[]) => cancelGeneratingBatch(...args),
}));

beforeEach(() => {
  queryState = { data: undefined, isSuccess: false, isError: false, isFetching: true };
  cancelGeneratingBatch.mockClear();
});

const REQ = {
  brandName: '촉촉연구소',
  proposalCount: 3,
  sceneCount: 5,
  concepts: [],
  purposeKeywords: [],
  excludeInfographic: false,
};

function mount(version: 'v1.0' | 'v1.5') {
  return render(PlanBatch, { channelId: 1, version, req: REQ, batchId: 1 });
}

describe('PlanBatch', () => {
  it('v1.5 는 아무 칸도 그리지 않는다', () => {
    // 완성 전까지 워크스페이스에 아무것도 보여주지 않는다. 만들어지는 동안 무엇이 일어나는지는
    //   생성 진행 화면이 말한다.
    const { container } = mount('v1.5');
    expect(container.querySelectorAll('[style*="aspect-ratio"]')).toHaveLength(0);
    expect(container.textContent?.trim()).toBe('');
  });

  it('v1.5 도 만드는 중 개수를 0 으로 보고한다', () => {
    // 이 값이 페이지의 '만드는 중' 머리글과 섹션 표시를 정한다. 그리지 않으면서 수를 보고하면
    //   아무 칸도 없는 "만드는 중 3" 이 남는다.
    const onLiveCount = vi.fn();
    render(PlanBatch, { channelId: 1, version: 'v1.5', req: REQ, batchId: 1, onLiveCount });
    expect(onLiveCount).toHaveBeenCalledWith(0);
  });

  it('v1.0 은 기획안 칸을 요청 개수만큼 그린다', () => {
    // 그 버전은 기획서 여러 벌이 산출물이고 사람이 그중에서 고른다. 함께 잠가 둔다.
    const { container } = mount('v1.0');
    expect(container.querySelectorAll('[style*="aspect-ratio"]')).toHaveLength(REQ.proposalCount);
  });

  it('완성 통보에 생성이 실제로 쓴 기획 LLM 을 실어 보낸다', () => {
    // 저장이 그 값을 그대로 굳힌다. 이 배치를 실제로 쓴 모델을 아는 곳은 생성 응답을 들고 있는 이
    //   컴포넌트뿐이고, 저장이 그때의 설정을 다시 읽으면 생성 후 설정을 바꾼 사람의 저장본에 쓰지
    //   않은 모델이 남는다. 눈으로는 안 잡힌다(저장은 성공하고 화면도 멀쩡하다)
    const proposal: PlanProposal = {
      id: 'p1',
      title: '촉촉연구소 15초',
      summary: '보습 라인 소개',
      scenes: [],
      bgm: null,
    };
    queryState = {
      data: { proposals: [proposal], llmModel: 'claude-sonnet-5' },
      isSuccess: true,
      isError: false,
      isFetching: false,
    };
    const onProposalComplete = vi.fn();
    // 씬 이미지를 쓰지 않는 버전은 문안이 도착한 순간 완성이다(기다릴 이미지가 없다)
    render(PlanBatch, {
      channelId: 1,
      version: 'v1.5',
      req: REQ,
      batchId: 42,
      onProposalComplete,
    });
    expect(onProposalComplete).toHaveBeenCalledWith(proposal, {}, 'claude-sonnet-5');
  });

  describe('생성 실패', () => {
    const failed = () => ({
      data: undefined,
      isSuccess: false,
      isError: true,
      isFetching: false,
      error: new Error('동영상은 최대 8개까지 만들 수 있습니다. 지금 입력은 10개로 나뉩니다.'),
    });

    it('타일이 없는 버전은 실패한 배치를 걷는다(취소와 같은 사가)', () => {
      // 되살릴 재시도 타일이 없어 배치가 화면에 남을 이유가 없고, 걷혀야 진행 화면이 폼으로 돌아간다.
      queryState = failed();
      render(PlanBatch, { channelId: 1, version: 'v1.5', req: REQ, batchId: 7 });
      expect(cancelGeneratingBatch).toHaveBeenCalledWith(expect.anything(), 'v1.5', 7);
    });

    it('타일이 있는 버전은 실패해도 배치를 걷지 않는다(재시도 타일이 되살린다)', () => {
      queryState = failed();
      render(PlanBatch, { channelId: 1, version: 'v1.0', req: REQ, batchId: 7 });
      expect(cancelGeneratingBatch).not.toHaveBeenCalled();
    });
  });
});
