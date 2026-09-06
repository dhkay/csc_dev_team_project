import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SagaRecoveryService } from '../saga-recovery.service';
import { SagaRunner } from '../saga-runner';
import { SagaDefinition, SagaStep } from '../saga.types';
import { InMemorySagaStore, createInMemorySagaStore } from '../testing';

/**
 * 복구 러너 회귀
 *
 * 여기서 지키는 것은 하나다: 크래시로 중단된 사가가 사람의 재방문 없이 끝까지 간다. 단계별 보상만
 * 있으면 프로세스가 살아 있을 때만 되돌려지고, 배포 재시작으로 단계 사이에서 죽은 중간 상태는 영구히
 * 남는다. 그 구멍을 막는 주체가 이 서비스다.
 */

interface TestContext {
  organizationId: number;
  ownerUserId: number;
  seed: number;
  first?: string;
  second?: string;
}

/** 단계 실행/보상 호출을 기록하는 테스트용 사가 */
class RecordingSaga implements SagaDefinition<TestContext> {
  calls: string[] = [];
  failSecond = false;

  constructor(readonly type: string) {}

  hydrate(
    payload: Record<string, unknown>,
    context: Record<string, unknown>,
  ): TestContext {
    return {
      organizationId: Number(payload.organizationId),
      ownerUserId: Number(payload.ownerUserId),
      seed: Number(payload.seed),
      ...(context as Partial<TestContext>),
    };
  }

  readonly steps: readonly SagaStep<TestContext>[] = [
    {
      name: 'first',
      execute: async () => {
        this.calls.push('first');
        return { first: 'done' };
      },
      compensate: async () => {
        this.calls.push('undo-first');
      },
    },
    {
      name: 'second',
      execute: async () => {
        this.calls.push('second');
        if (this.failSecond) throw new Error('두 번째 단계 실패');
        return { second: 'done' };
      },
    },
  ];
}

describe('SagaRecoveryService', () => {
  let store: InMemorySagaStore;
  let alpha: RecordingSaga;
  let beta: RecordingSaga;
  let service: SagaRecoveryService;

  const STALE_MS = 60_000;

  /** 중단된 사가를 만든다: 1단계까지 끝난 상태로 두고 수정 시각을 과거로 돌린다. */
  async function crashedAfterFirstStep(saga: RecordingSaga): Promise<number> {
    const instance = await store.startOrGet({
      organizationId: 1,
      ownerUserId: 2,
      sagaType: saga.type,
      clientRequestId: null,
      payload: { organizationId: 1, ownerUserId: 2, seed: 7 },
    });
    store.crashAt(instance.id, 1, { first: 'done' });
    store.backdate(instance.id, STALE_MS * 2);
    return instance.id;
  }

  function makeService(definitions: SagaDefinition<object>[]): SagaRecoveryService {
    return new SagaRecoveryService(store, new SagaRunner(store), definitions);
  }

  beforeEach(() => {
    store = createInMemorySagaStore();
    alpha = new RecordingSaga('test.alpha');
    beta = new RecordingSaga('test.beta');
    service = makeService([alpha, beta]);
  });

  it('중단된 사가를 멈춘 지점부터 이어 간다', async () => {
    const id = await crashedAfterFirstStep(alpha);

    const result = await service.recoverStale(STALE_MS, 10);

    expect(result).toEqual({ recovered: 1, failed: 0, skipped: 0 });
    // 1단계는 다시 돌지 않고 2단계만 돈다.
    expect(alpha.calls).toEqual(['second']);
    const row = await store.findById(id);
    expect(row?.status).toBe('COMPLETED');
    expect(row?.step).toBe(2);
  });

  it('종류가 다른 사가도 각자의 정의로 이어 간다', async () => {
    await crashedAfterFirstStep(alpha);
    await crashedAfterFirstStep(beta);

    const result = await service.recoverStale(STALE_MS, 10);

    expect(result.recovered).toBe(2);
    expect(alpha.calls).toEqual(['second']);
    expect(beta.calls).toEqual(['second']);
  });

  it('아직 유예가 지나지 않은 사가는 건드리지 않는다', async () => {
    const instance = await store.startOrGet({
      organizationId: 1,
      ownerUserId: 2,
      sagaType: alpha.type,
      clientRequestId: null,
      payload: { organizationId: 1, ownerUserId: 2, seed: 7 },
    });
    // 방금 진행된 사가: 정상 실행 중일 수 있으므로 가로채면 안 된다.
    store.crashAt(instance.id, 1, { first: 'done' });

    const result = await service.recoverStale(STALE_MS, 10);

    expect(result).toEqual({ recovered: 0, failed: 0, skipped: 0 });
    expect(alpha.calls).toEqual([]);
    expect((await store.findById(instance.id))?.status).toBe('RUNNING');
  });

  it('한 번 집은 사가는 이어서 다시 집지 않는다', async () => {
    await crashedAfterFirstStep(alpha);

    await service.recoverStale(STALE_MS, 10);
    alpha.calls = [];
    const second = await service.recoverStale(STALE_MS, 10);

    // 첫 복구로 COMPLETED 가 됐으므로 대상에서 빠진다(중복 실행 방지)
    expect(second).toEqual({ recovered: 0, failed: 0, skipped: 0 });
    expect(alpha.calls).toEqual([]);
  });

  it('이어 갈 수 없으면 보상해 흔적을 남기지 않는다', async () => {
    alpha.failSecond = true;
    const id = await crashedAfterFirstStep(alpha);

    const result = await service.recoverStale(STALE_MS, 10);

    // 되돌리기까지 끝났으므로 실패가 아니다(중간 상태가 남지 않았다)
    expect(result).toEqual({ recovered: 1, failed: 0, skipped: 0 });
    expect(alpha.calls).toEqual(['second', 'undo-first']);
    expect((await store.findById(id))?.status).toBe('COMPENSATED');
  });

  it('정의를 모르는 사가는 건너뛰고 남긴다', async () => {
    const instance = await store.startOrGet({
      organizationId: 1,
      ownerUserId: 2,
      sagaType: 'test.removed-by-deploy',
      clientRequestId: null,
      payload: {},
    });
    store.backdate(instance.id, STALE_MS * 2);

    const result = await service.recoverStale(STALE_MS, 10);

    expect(result).toEqual({ recovered: 0, failed: 0, skipped: 1 });
    // 지우지 않는다: 되돌리지 못한 부수효과의 유일한 기록이다.
    expect((await store.findById(instance.id))?.status).toBe('RUNNING');
  });

  it('한 사가의 실패가 나머지 복구를 막지 않고, 다음 주기가 그것을 다시 시도한다', async () => {
    // 저장소 쓰기가 일시적으로 실패하는 상황(가장 현실적인 재시도 사유). 그때 사가 행은 아직
    //   비종결이라 복구는 실패로 세고, 다음 주기가 같은 사가를 다시 집는다.
    const failingId = await crashedAfterFirstStep(alpha);
    store.backdate(failingId, STALE_MS * 10); // 이 사가가 먼저 처리되게(오래 방치된 순서)
    const healthyId = await crashedAfterFirstStep(beta);

    const realSetStatus = store.setStatus.bind(store);
    const flaky = vi
      .spyOn(store, 'setStatus')
      .mockImplementation(async (id, status, error) => {
        if (id === failingId) throw new Error('상태 기록 실패(일시적)');
        return realSetStatus(id, status, error);
      });

    const first = await service.recoverStale(STALE_MS, 10);

    expect(first).toEqual({ recovered: 1, failed: 1, skipped: 0 });
    expect(beta.calls).toEqual(['second']);
    expect((await store.findById(healthyId))?.status).toBe('COMPLETED');
    expect((await store.findById(failingId))?.status).toBe('RUNNING');

    flaky.mockRestore();
    alpha.calls = [];

    // 방금 집힌 사가는 곧바로 다시 집지 않는다(재시도 백오프). 계속 실패하는 사가가 매 주기를
    //   독점하지 않게 하는 장치다.
    expect(await service.recoverStale(STALE_MS, 10)).toEqual({
      recovered: 0,
      failed: 0,
      skipped: 0,
    });

    store.backdate(failingId, STALE_MS * 2);
    const second = await service.recoverStale(STALE_MS, 10);

    // 저장소가 회복된 뒤: 이미 끝난 단계는 되풀이하지 않고 마무리만 한다.
    expect(second).toEqual({ recovered: 1, failed: 0, skipped: 0 });
    expect(alpha.calls).toEqual([]);
    expect((await store.findById(failingId))?.status).toBe('COMPLETED');
  });

  it('한 번에 처리하는 수를 상한으로 나눈다', async () => {
    await crashedAfterFirstStep(alpha);
    await crashedAfterFirstStep(beta);

    const result = await service.recoverStale(STALE_MS, 1);

    expect(result.recovered).toBe(1);
  });

  it('겹친 틱은 건너뛴다', async () => {
    await crashedAfterFirstStep(alpha);
    const spy = vi.spyOn(service, 'recoverStale');
    let release: () => void = () => undefined;
    spy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ recovered: 0, failed: 0, skipped: 0 });
        }),
    );

    const first = service.tick();
    await service.tick(); // 앞 틱이 도는 중이라 아무 일도 하지 않는다
    release();
    await first;

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('틱 자체가 실패해도 예외를 밖으로 던지지 않는다', async () => {
    vi.spyOn(store, 'claimStale').mockRejectedValueOnce(new Error('저장소 도달 불가'));

    // 스케줄러를 죽이면 그 뒤로 어떤 복구도 돌지 않는다.
    await expect(service.tick()).resolves.toBeUndefined();
  });

  describe('보존기간 정리', () => {
    /** 끝난 사가 하나를 만들고 그 시각을 과거로 돌린다. */
    async function settled(saga: RecordingSaga, ageMs: number): Promise<number> {
      const id = await crashedAfterFirstStep(saga);
      await service.recoverStale(STALE_MS, 10); // 끝까지 보낸다(COMPLETED)
      store.backdate(id, ageMs);
      return id;
    }

    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

    it('보존기간이 지난 끝난 사가만 지운다', async () => {
      const oldId = await settled(alpha, 40 * 24 * 60 * 60 * 1000);
      alpha.calls = [];
      const recentId = await settled(beta, 60_000);

      const deleted = await service.pruneSettled(THIRTY_DAYS, 100);

      expect(deleted).toBe(1);
      expect(await store.findById(oldId)).toBeNull();
      expect(await store.findById(recentId)).not.toBeNull();
    });

    it('진행 중인 사가는 아무리 오래돼도 지우지 않는다', async () => {
      // 지우면 그 사가는 이어 갈 근거를 잃는다(중간 상태가 영구히 남는다)
      const id = await crashedAfterFirstStep(alpha);
      store.backdate(id, 400 * 24 * 60 * 60 * 1000);

      expect(await service.pruneSettled(THIRTY_DAYS, 100)).toBe(0);
      expect((await store.findById(id))?.status).toBe('RUNNING');
    });

    it('한 번에 지우는 수를 상한으로 나눈다', async () => {
      await settled(alpha, 40 * 24 * 60 * 60 * 1000);
      alpha.calls = [];
      await settled(beta, 40 * 24 * 60 * 60 * 1000);

      expect(await service.pruneSettled(THIRTY_DAYS, 1)).toBe(1);
    });

    it('틱이 복구와 정리를 함께 돌린다', async () => {
      const spy = vi.spyOn(service, 'pruneSettled');

      await service.tick();

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  it('정의를 아는지 물을 수 있다(배선 확인용)', () => {
    // 정의를 만들고 등록을 잊으면 그 사가만 중단 시 방치된다. 앱의 조립 테스트가 이 값으로 확인한다.
    expect(service.knows('test.alpha')).toBe(true);
    expect(service.knows('test.unknown')).toBe(false);
  });
});