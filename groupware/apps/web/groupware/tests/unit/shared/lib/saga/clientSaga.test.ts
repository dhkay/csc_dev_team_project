/**
 * 브라우저용 사가 러너
 *
 * 이 러너가 지키는 것은 셋이다: 순서, 실패하면 앞으로 가지 않기, 역순 보상. 셋 다 깨져도 예외가
 * 나지 않고 화면도 멀쩡해서(단계가 조용히 건너뛰어질 뿐이다) 테스트로만 잡힌다.
 */
import { describe, it, expect, vi } from 'vitest';
import { runClientSaga, type ClientSagaStep } from '$lib/shared/lib/saga/clientSaga';

interface Ctx {
  trace: string[];
  made?: string;
}

/** 실행/보상을 trace 에 적는 단계. throws 면 실행에서 던진다. */
function step(name: string, opts: { throws?: boolean; compensates?: boolean } = {}) {
  const s: ClientSagaStep<Ctx> = {
    name,
    execute(ctx) {
      ctx.trace.push(`run:${name}`);
      if (opts.throws) throw new Error(`${name} 실패`);
      return {};
    },
  };
  if (opts.compensates) {
    return {
      ...s,
      compensate(ctx: Ctx) {
        ctx.trace.push(`undo:${name}`);
      },
    };
  }
  return s;
}

describe('runClientSaga', () => {
  it('단계를 선언한 순서대로 실행한다', async () => {
    const ctx: Ctx = { trace: [] };
    const outcome = await runClientSaga([step('a'), step('b'), step('c')], ctx);
    expect(outcome.ok).toBe(true);
    expect(ctx.trace).toEqual(['run:a', 'run:b', 'run:c']);
  });

  it('산출물을 컨텍스트에 합쳐 다음 단계에 넘긴다', async () => {
    // 보상이 쓸 값을 클로저가 아니라 컨텍스트로 나르게 하는 규칙. 이것이 없으면 보상이 무엇을
    //   되돌려야 하는지 알 수 없다.
    const seen: (string | undefined)[] = [];
    const outcome = await runClientSaga<Ctx>(
      [
        { name: 'make', execute: () => ({ made: '만든 것' }) },
        {
          name: 'read',
          execute: (ctx) => {
            seen.push(ctx.made);
          },
        },
      ],
      { trace: [] },
    );
    expect(seen).toEqual(['만든 것']);
    expect(outcome.ok && outcome.context.made).toBe('만든 것');
  });

  it('한 단계가 실패하면 뒤 단계를 실행하지 않는다', async () => {
    // 이 규칙이 이 러너의 존재 이유다. 취소에서는 "멈추지 못했는데 화면에서는 사라진" 상태가 여기서 막힌다.
    const ctx: Ctx = { trace: [] };
    const outcome = await runClientSaga([step('a'), step('b', { throws: true }), step('c')], ctx);
    expect(outcome.ok).toBe(false);
    expect(ctx.trace).not.toContain('run:c');
  });

  it('실패하면 끝난 단계를 역순으로 보상한다', async () => {
    const ctx: Ctx = { trace: [] };
    await runClientSaga(
      [
        step('a', { compensates: true }),
        step('b', { compensates: true }),
        step('c', { throws: true }),
      ],
      ctx,
    );
    // 실패한 단계 자신은 보상하지 않는다(그 단계는 아무것도 만들지 못했다)
    expect(ctx.trace).toEqual(['run:a', 'run:b', 'run:c', 'undo:b', 'undo:a']);
  });

  it('어느 단계에서 멈췄는지 결과에 담는다', async () => {
    const outcome = await runClientSaga([step('a'), step('b', { throws: true })], { trace: [] });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failedStep).toBe('b');
      expect((outcome.error as Error).message).toBe('b 실패');
    }
  });

  it('보상이 실패해도 나머지 보상은 계속한다', async () => {
    // 하나가 실패했다고 나머지를 되돌리지 않으면 더 어긋난 상태가 남는다.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx: Ctx = { trace: [] };
    await runClientSaga(
      [
        step('a', { compensates: true }),
        {
          name: 'b',
          execute: (c: Ctx) => {
            c.trace.push('run:b');
          },
          compensate: () => {
            throw new Error('보상 실패');
          },
        },
        step('c', { throws: true }),
      ],
      ctx,
    );
    expect(ctx.trace).toContain('undo:a');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('실패를 던지지 않고 값으로 돌려준다', async () => {
    // 호출부는 대개 화면 전환을 이 값으로 가른다. 던지면 그 분기가 try/catch 로 흩어진다.
    await expect(
      runClientSaga([step('a', { throws: true })], { trace: [] }),
    ).resolves.toMatchObject({ ok: false });
  });

  it('단계가 없으면 성공이다', async () => {
    const outcome = await runClientSaga([], { trace: [] });
    expect(outcome.ok).toBe(true);
  });
});
