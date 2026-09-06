import { describe, it, expect, beforeEach } from 'vitest';
import { SagaBusyError, SagaRunner } from '../saga-runner';
import { SagaDefinition, SagaStep } from '../saga.types';
import { InMemorySagaStore, createInMemorySagaStore } from '../testing';

/**
 * 사가 오케스트레이터 테스트
 *
 * 이 파일이 지키는 계약: (1) 단계 직후 진행 상태가 남는다, (2) 실패하면 역순 보상, (3) 중단된 인스턴스가
 * 그 지점부터 이어진다, (4) 완료된 사가는 다시 실행되지 않는다, (5) 한 사가는 한 실행만 돈다.
 * 하나라도 깨지면 크래시가 중간 상태를 영구히 남기거나 부수효과가 두 번 일어난다.
 */

interface Ctx {
  input: string;
  a?: string;
  b?: string;
}

/** 단계 3개짜리 정의. 각 단계의 실행/보상 호출을 배열에 남겨 순서를 검증한다. */
function makeDefinition(log: string[], failAt?: number): SagaDefinition<Ctx> {
  const step = (name: string, produce: Partial<Ctx>): SagaStep<Ctx> => ({
    name,
    async execute() {
      log.push(`exec:${name}`);
      if (failAt !== undefined && name === `s${failAt}`) throw new Error(`${name} 실패`);
      return produce;
    },
    async compensate() {
      log.push(`comp:${name}`);
    },
  });
  return {
    type: 'test.saga',
    steps: [step('s0', { a: 'A' }), step('s1', { b: 'B' }), step('s2', {})],
    hydrate: (payload, context) => ({
      input: String(payload.input ?? ''),
      ...(context as Partial<Ctx>),
    }),
  };
}

const input = {
  organizationId: 10,
  ownerUserId: 7,
  clientRequestId: 'k1',
  payload: { input: 'x' },
};

describe('SagaRunner', () => {
  let store: InMemorySagaStore;
  let runner: SagaRunner;
  let log: string[];

  beforeEach(() => {
    store = createInMemorySagaStore();
    runner = new SagaRunner(store);
    log = [];
  });

  it('단계를 순서대로 실행하고 매 단계 직후 진행 상태를 남긴다', async () => {
    // 진행 기록이 단계 뒤가 아니라 묶음 뒤에 오면, 중간에서 죽었을 때 이미 한 일을 다시 한다.
    const outcome = await runner.run(makeDefinition(log), input);

    expect(log).toEqual(['exec:s0', 'exec:s1', 'exec:s2']);
    expect(store.writes).toEqual([
      'advance:1',
      'advance:2',
      'advance:3',
      'status:COMPLETED',
    ]);
    expect(outcome.alreadyCompleted).toBe(false);
    expect(outcome.context).toMatchObject({ a: 'A', b: 'B' });
  });

  it('실패하면 지금까지의 단계를 역순으로 보상하고 원래 예외를 그대로 올린다', async () => {
    // 감싸면 컨트롤러의 상태코드 매핑(400/404)이 전부 500 이 된다.
    const def = makeDefinition(log, 2);

    await expect(runner.run(def, input)).rejects.toThrow('s2 실패');

    expect(log).toEqual(['exec:s0', 'exec:s1', 'exec:s2', 'comp:s1', 'comp:s0']);
    expect(store.rows.get(1)!.status).toBe('COMPENSATED');
  });

  it('완료된 사가는 다시 실행하지 않고 저장된 컨텍스트를 돌려준다', async () => {
    await runner.run(makeDefinition(log), input);
    log.length = 0;

    const again = await runner.run(makeDefinition(log), input);

    expect(log).toEqual([]);
    expect(again.alreadyCompleted).toBe(true);
    expect(again.context).toMatchObject({ a: 'A', b: 'B' });
  });

  it('중단된 사가는 그 지점부터 이어 간다(앞 단계를 되풀이하지 않는다)', async () => {
    const started = await store.startOrGet({
      ...input,
      sagaType: 'test.saga',
    });
    store.crashAt(started.id, 2, { a: 'A', b: 'B' });

    await runner.resume(makeDefinition(log), (await store.findById(started.id))!);

    expect(log).toEqual(['exec:s2']);
    expect(store.rows.get(started.id)!.status).toBe('COMPLETED');
  });

  it('보상 중에 죽은 사가는 남은 보상을 이어서 끝낸다(전진하지 않는다)', async () => {
    // 이미 되돌리기로 결정된 사가를 전진시키면, 되돌린 앞 단계 위에 뒤 단계를 쌓는다.
    const started = await store.startOrGet({ ...input, sagaType: 'test.saga' });
    store.crashAt(started.id, 2, { a: 'A', b: 'B' });
    await store.setStatus(started.id, 'COMPENSATING', '앞선 실패');

    await runner.resume(makeDefinition(log), (await store.findById(started.id))!);

    expect(log).toEqual(['comp:s1', 'comp:s0']);
    expect(store.rows.get(started.id)!.status).toBe('COMPENSATED');
  });

  it('보상 하나가 실패해도 나머지 보상은 계속한다', async () => {
    // 한 보상 실패로 멈추면 되돌릴 수 있었던 것까지 남는다. 남은 흔적은 경고가 유일한 추적 근거다.
    const def = makeDefinition(log, 2);
    const steps = def.steps as SagaStep<Ctx>[];
    steps[1] = {
      ...steps[1],
      compensate: async () => {
        log.push('comp:s1:fail');
        throw new Error('보상 실패');
      },
    };

    await expect(runner.run(def, input)).rejects.toThrow('s2 실패');

    expect(log).toEqual(['exec:s0', 'exec:s1', 'exec:s2', 'comp:s1:fail', 'comp:s0']);
    expect(store.rows.get(1)!.status).toBe('COMPENSATED');
  });

  it('되돌아간 사가에 같은 키로 다시 오면 처음부터 다시 시도한다', async () => {
    const instance = await store.startOrGet({ ...input, sagaType: 'test.saga' });
    await store.advance(instance.id, 2, { a: 'A', b: 'B' });
    await store.setStatus(instance.id, 'COMPENSATED', '이전 실패');
    log.length = 0;

    // 되돌린 뒤라 남은 부수효과가 없다 → 0단계부터가 맞다(이어 가면 없는 산출물을 전제한다)
    const outcome = await runner.run(makeDefinition(log), input);

    expect(log).toEqual(['exec:s0', 'exec:s1', 'exec:s2']);
    expect(outcome.alreadyCompleted).toBe(false);
  });

  describe('단계 멱등키', () => {
    /** 단계가 받은 키를 기록하는 정의 */
    function keyRecordingDefinition(keys: string[], failFirstRun: { value: boolean }) {
      const definition: SagaDefinition<Ctx> = {
        type: 'test.saga',
        steps: [
          {
            name: 'external-create',
            execute: async (_ctx, meta) => {
              keys.push(meta.idempotencyKey);
              if (failFirstRun.value) {
                failFirstRun.value = false;
                // 벤더는 만들었지만 진행 기록 전에 죽은 상황을 흉내낸다.
                throw new Error('진행 기록 전 중단');
              }
              return { a: 'A' };
            },
          },
        ],
        hydrate: (payload, context) => ({
          input: String(payload.input ?? ''),
          ...(context as Partial<Ctx>),
        }),
      };
      return definition;
    }

    it('재실행에도 같은 키를 준다(외부 서비스가 중복을 접을 수 있다)', async () => {
      // 이 성질이 없으면 벤더 호출 단계는 재실행마다 새 잡을 만든다. 그것이 남은 이중 과금 창이었다.
      const keys: string[] = [];
      const failFirst = { value: true };
      const def = keyRecordingDefinition(keys, failFirst);

      await expect(runner.run(def, input)).rejects.toThrow('진행 기록 전 중단');
      // 같은 키로 다시 온 요청은 되돌아간 사가를 처음부터 다시 시도한다.
      await runner.run(def, input);

      expect(keys).toHaveLength(2);
      expect(keys[0]).toBe(keys[1]);
    });

    it('사가와 단계가 다르면 키도 다르다', async () => {
      const keys: string[] = [];
      const def = keyRecordingDefinition(keys, { value: false });

      await runner.run(def, input);
      await runner.run(def, { ...input, clientRequestId: 'k2' });

      expect(keys[0]).not.toBe(keys[1]);
    });
  });

  describe('실행권(같은 사가를 두 실행이 함께 돌지 않는다)', () => {
    /** 느린 단계를 가진 정의: 두 실행이 겹칠 시간을 만든다. */
    function slowDefinition(entries: string[], delayMs: number): SagaDefinition<Ctx> {
      const step = (name: string, produce: Partial<Ctx>): SagaStep<Ctx> => ({
        name,
        async execute() {
          entries.push(`exec:${name}`);
          await new Promise((r) => setTimeout(r, delayMs));
          return produce;
        },
      });
      return {
        type: 'test.saga',
        steps: [step('s0', { a: 'A' }), step('s1', { b: 'B' })],
        hydrate: (payload, context) => ({
          input: String(payload.input ?? ''),
          ...(context as Partial<Ctx>),
        }),
      };
    }

    it('같은 키로 동시에 와도 각 단계는 한 번만 실행된다', async () => {
      // 이 규칙이 없으면 두 요청이 같은 사가의 남은 단계를 각자 수행한다. 영상 흐름에서 그것은
      //   유료 잡 두 개를 뜻한다(나중에 붙은 잡만 폴링되므로 먼저 만든 잡은 요금만 나가는 고아)
      const def = slowDefinition(log, 15);

      const [first, second] = await Promise.all([
        runner.run(def, input, { budgetMs: 2000, pollMs: 5 }),
        runner.run(def, input, { budgetMs: 2000, pollMs: 5 }),
      ]);

      expect(log).toEqual(['exec:s0', 'exec:s1']);
      // 기다린 쪽은 이긴 실행의 결과를 그대로 받는다(중복 제출이 화면에서 보이지 않는다)
      expect(first.context).toEqual(second.context);
      expect([first.alreadyCompleted, second.alreadyCompleted].sort()).toEqual([false, true]);
      expect(store.rows.get(1)!.status).toBe('COMPLETED');
    });

    it('실행이 끝나면 실행권을 놓는다(다음 요청이 기다리지 않는다)', async () => {
      await runner.run(makeDefinition(log), input);

      // 놓지 않으면 이 두 번째 호출이 리스 만료까지 붙잡힌다. 곧바로 완료 결과를 받아야 한다.
      const again = await runner.run(makeDefinition(log), input, { budgetMs: 50, pollMs: 5 });

      expect(again.alreadyCompleted).toBe(true);
    });

    it('앞 실행이 되돌아가면 기다린 쪽이 처음부터 다시 시도한다', async () => {
      // 되돌아간 사가는 남은 부수효과가 없다: 기다린 요청에게 404 나 남의 오류를 주는 것보다 그 요청이
      //   자기 실행으로 결과를 받는 것이 맞다.
      const failing = makeDefinition(log, 1);
      const first = runner.run(failing, input).catch(() => 'failed');
      const second = runner.run(slowDefinition(log, 1), input, { budgetMs: 2000, pollMs: 5 });

      expect(await first).toBe('failed');
      const outcome = await second;
      expect(outcome.alreadyCompleted).toBe(false);
      expect(store.rows.get(1)!.status).toBe('COMPLETED');
    });

    it('기다리는 시간 안에 끝나지 않으면 SagaBusyError', async () => {
      const def = slowDefinition(log, 300);
      const winner = runner.run(def, input);

      await expect(
        runner.run(def, input, { budgetMs: 30, pollMs: 5 }),
      ).rejects.toBeInstanceOf(SagaBusyError);

      await winner;
    });

    it('멱등키가 없으면 서로 다른 사가라 기다리지 않는다', async () => {
      // 재렌더처럼 키가 없는 쓰기는 매번 새 사가다: 실행권이 경쟁하지 않는다.
      const def = slowDefinition(log, 10);
      const noKey = { ...input, clientRequestId: null };

      await Promise.all([runner.run(def, noKey), runner.run(def, noKey)]);

      expect(log).toEqual(['exec:s0', 'exec:s0', 'exec:s1', 'exec:s1']);
      expect(store.rows.size).toBe(2);
    });

    it('단계가 진행되면 실행권이 갱신된다(리스는 사가 전체가 아니라 한 단계의 상한)', async () => {
      // 갱신하지 않으면 느린 사가가 아직 살아 있는데도 리스를 잃고, 그때 온 중복 요청이 남은 단계를
      //   함께 수행한다. 재실행 안전하지 않은 단계(벤더 잡 등록)에서 그것이 곧 사고다.
      const instance = await store.startOrGet({ ...input, sagaType: 'test.saga' });
      expect(await store.tryAcquire(instance.id, 1000)).toBe(true);
      store.backdate(instance.id, 2000); // 리스가 만료될 만큼 시간이 흘렀다

      // 진행 기록이 없으면 남이 실행권을 빼앗을 수 있는 상태다.
      expect(await store.tryAcquire(instance.id, 1000)).toBe(true);
      store.backdate(instance.id, 2000);
      await store.advance(instance.id, 1, { a: 'A' });

      // 진행이 있었으므로 실행은 살아 있다: 빼앗기지 않는다.
      expect(await store.tryAcquire(instance.id, 1000)).toBe(false);
    });
  });
});