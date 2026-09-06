/**
 * 생성 중 배치의 취소 사가
 *
 * 이 테스트가 있는 이유는 조용한 실패다. 취소는 세 단계이고(요청 중단, 목록 제외, 캐시 제거)
 * 그중 쿼리 두 개는 키가 어긋나도 에러를 내지 않는다. 실제로 버전 축이 생성 쿼리에 추가됐을 때
 * 취소 쪽 사본만 옛 모양으로 남아, 타일은 사라지는데 LLM 은 끝까지 돌아 조직에 과금됐다. 화면으로는
 * 정상으로 보였다.
 *
 * 순서와 실패 처리도 같은 성질이다. 멈추기 전에 걷어내면 화면에서만 사라지고, 절반만 취소된 채
 * 진행 화면이 입력 폼으로 돌아가면 사용자가 다시 눌러 두 번 과금된다. 셋 다 여기서 잠근다.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('$lib/infrastructure/http/clientInstances', () => ({ frontClient: vi.fn() }));

import { cancelGeneratingBatch } from '$lib/features/marketing-channels/lib/cancelGeneratingBatch';
import { generatePlansQueryOptions } from '$lib/features/marketing-channels/queries/plans.query';
import { planGenerationStore } from '$lib/shared/lib/stores/planGenerationStore/planGenerationStore.svelte';
import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';
import type { PlanGenerationRequest } from '$lib/features/marketing-channels/types';

const req = {
  brandName: 'csc',
  concepts: [],
  purposeKeywords: ['수분크림'],
  proposalCount: 1,
  sceneCount: 4,
  excludeInfographic: false,
} as unknown as PlanGenerationRequest;

/** 두 쿼리 호출이 받는 인자. 키가 이 사가의 계약이라 그 모양을 잃지 않게 적어 둔다. */
type QueryFilter = { queryKey: readonly unknown[] };

/** 호출 순서를 함께 기록하는 가짜 클라이언트. 순서가 이 사가의 계약이라 값만으로는 부족하다. */
function fakeQueryClient(trace: string[] = []) {
  return {
    trace,
    cancelQueries: vi.fn(async (_filter: QueryFilter) => {
      trace.push('cancelQueries');
    }),
    removeQueries: vi.fn((_filter: QueryFilter) => {
      trace.push('removeQueries');
    }),
  };
}

describe('cancelGeneratingBatch', () => {
  let client: ReturnType<typeof fakeQueryClient>;

  beforeEach(() => {
    client = fakeQueryClient();
    toastStore.clear();
  });

  it('생성 쿼리와 같은 키로 요청을 끊고 캐시를 지운다', async () => {
    const batchId = planGenerationStore.addBatch(5, req);
    // 그 배치가 실제로 쓰는 키. runId 는 배치 id 다
    const expected = generatePlansQueryOptions('v1.5', 5, req, batchId).queryKey;

    await cancelGeneratingBatch(client as never, 'v1.5', batchId);

    expect(client.cancelQueries).toHaveBeenCalledWith({ queryKey: expected });
    expect(client.removeQueries).toHaveBeenCalledWith({ queryKey: expected });
  });

  it('버전을 그대로 실어 보낸다', async () => {
    // 버전이 빠지거나 다른 값이면 키가 어긋나 두 호출 모두 조용히 아무 일도 하지 않는다.
    const batchId = planGenerationStore.addBatch(5, req);
    await cancelGeneratingBatch(client as never, 'v1.0', batchId);

    const sent = client.cancelQueries.mock.calls[0][0].queryKey;
    expect(sent[1]).toBe('v1.0');
    expect(sent).not.toEqual(generatePlansQueryOptions('v1.5', 5, req, batchId).queryKey);
  });

  it('배치를 목록에서 걷어내고 전부 성공하면 true 다', async () => {
    // 요청만 끊고 목록에 남기면 끝나지 않는 타일이 남는다. 반환값은 진행 화면이 폼으로 돌아갈지를 가른다.
    const batchId = planGenerationStore.addBatch(5, req);
    await expect(cancelGeneratingBatch(client as never, 'v1.5', batchId)).resolves.toBe(true);
    expect(planGenerationStore.batch(batchId)).toBeUndefined();
  });

  it('멈추는 것이 걷어내는 것보다 먼저다', async () => {
    // 순서가 뒤집히면 화면에서는 사라졌는데 LLM 은 계속 도는 창이 열린다.
    const batchId = planGenerationStore.addBatch(5, req);
    const trace: string[] = [];
    const ordered = fakeQueryClient(trace);
    const original = planGenerationStore.removeBatch.bind(planGenerationStore);
    const spy = vi
      .spyOn(planGenerationStore, 'removeBatch')
      .mockImplementation((id: number) => {
        trace.push('removeBatch');
        original(id);
      });

    await cancelGeneratingBatch(ordered as never, 'v1.5', batchId);

    expect(trace).toEqual(['cancelQueries', 'removeBatch', 'removeQueries']);
    spy.mockRestore();
  });

  it('요청을 끊지 못하면 배치를 걷어내지 않고 false 를 준다', async () => {
    // 이 사가의 핵심. 멈추지 못했으면 타일이 남아 있어야 사용자가 그 사실을 볼 수 있고,
    //   false 라서 진행 화면도 입력 폼으로 돌아가지 않는다(다시 눌러 두 번 과금되는 것을 막는다)
    const batchId = planGenerationStore.addBatch(5, req);
    const failing = fakeQueryClient();
    failing.cancelQueries.mockRejectedValue(new Error('중단 실패'));

    await expect(cancelGeneratingBatch(failing as never, 'v1.5', batchId)).resolves.toBe(false);
    expect(planGenerationStore.batch(batchId)).toBeDefined();
    expect(failing.removeQueries).not.toHaveBeenCalled();
  });

  it('걷어낸 뒤 실패하면 보상이 배치를 되돌려 놓는다', async () => {
    // 아직 도는 작업이 화면에서 사라진 채 남으면 사용자는 멈춘 줄 알지만 과금은 계속된다.
    const batchId = planGenerationStore.addBatch(5, req);
    const failing = fakeQueryClient();
    failing.removeQueries.mockImplementation(() => {
      throw new Error('캐시 제거 실패');
    });

    await expect(cancelGeneratingBatch(failing as never, 'v1.5', batchId)).resolves.toBe(false);
    expect(planGenerationStore.batch(batchId)).toMatchObject({ id: batchId, channelId: 5 });
  });

  it('실패하면 알린다', async () => {
    // 조용히 실패하면 멈춘 줄 알고 넘어가는데, 그 오해가 정확히 이 사가가 막으려는 것이다.
    const batchId = planGenerationStore.addBatch(5, req);
    const failing = fakeQueryClient();
    failing.cancelQueries.mockRejectedValue(new Error('중단 실패'));

    await cancelGeneratingBatch(failing as never, 'v1.5', batchId);
    expect(toastStore.items.some((t) => t.title === '생성을 취소하지 못했습니다')).toBe(true);
  });

  it('이미 걷힌 배치를 다시 취소해도 성공으로 끝난다', async () => {
    // 그리드의 일괄 삭제와 진행 화면의 취소가 같은 배치에 겹칠 수 있다. 그때 할 일이 없는 것이지
    //   실패한 것이 아니다(실패로 보면 이미 멈춘 생성에 취소 실패 알림이 뜬다)
    const batchId = planGenerationStore.addBatch(5, req);
    await cancelGeneratingBatch(client as never, 'v1.5', batchId);
    await expect(cancelGeneratingBatch(client as never, 'v1.5', batchId)).resolves.toBe(true);
    // 없는 배치에는 끊을 요청도 없다(두 번째 호출이 키 없이 쿼리를 건드리지 않는다)
    expect(client.cancelQueries).toHaveBeenCalledTimes(1);
  });
});
