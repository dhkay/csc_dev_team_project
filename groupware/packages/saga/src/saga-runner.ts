import { SagaLogger, silentSagaLogger } from './saga-logger';
import { SagaStorePort } from './saga-store.port';
import { assertStorableSagaData } from './saga-context';
import {
  NON_TERMINAL_SAGA_STATUSES,
  SagaDefinition,
  SagaInstance,
  SagaOutcome,
  SagaStepMeta,
  sagaStepIdempotencyKey,
} from './saga.types';

/**
 * 실행권 유지 시간(ms). 이 시간이 지난 실행권은 죽은 것으로 보고 다음 요청이 빼앗는다.
 *
 * 복구의 유예(5분)와 다른 값인 이유: 두 값이 답하는 질문이 다르다. 이 값은 "지금 누가 돌리고 있나"
 * 이고, 복구의 유예는 "이 사가가 버려졌나" 다. 사가는 수 초 안에 끝나므로 30초면 살아 있는 실행을
 * 빼앗지 않을 만큼 넉넉하고, 크래시한 실행이 사가를 오래 잠그지도 않는다(재시도가 30초 뒤엔 이어 간다)
 */
export const SAGA_LEASE_MS = 30 * 1000;
/** 다른 실행이 끝나기를 기다리는 시간(ms). 이 안에 끝나지 않으면 SagaBusyError. */
export const SAGA_WAIT_BUDGET_MS = 5 * 1000;
/** 기다리는 동안의 폴링 간격(ms) */
export const SAGA_WAIT_POLL_MS = 100;

/** 기다림 조절값. 서비스는 기본값을 쓰고, 테스트만 줄여 쓴다. */
export interface WaitOptions {
  budgetMs?: number;
  pollMs?: number;
}

/**
 * 같은 사가를 다른 실행이 들고 있고, 기다리는 시간 안에 끝나지 않았다.
 *
 * 드물다: 중복 제출은 보통 앞 실행이 수 초 안에 끝나 그 결과를 돌려받는다. 이 예외까지 오는 것은 앞
 * 실행이 비정상적으로 오래 걸리거나 크래시한 경우이고, 그때는 잠시 뒤 다시 시도하면 실행권이 풀린다.
 * 호출부(서비스)가 409 로 번역한다: 실패가 아니라 "지금은 대답할 수 없다" 이기 때문이다.
 */
export class SagaBusyError extends Error {
  constructor(readonly sagaType: string) {
    super('같은 요청이 처리 중입니다. 잠시 후 다시 시도하세요.');
    this.name = 'SagaBusyError';
  }
}

/** 단계에 넘길 실행 정보를 만든다. 키는 재실행에 불변인 두 값에서만 나온다. */
function stepMeta(sagaId: number, stepIndex: number, stepName: string): SagaStepMeta {
  return {
    sagaId,
    stepIndex,
    stepName,
    idempotencyKey: sagaStepIdempotencyKey(sagaId, stepIndex),
  };
}

/** 사가 실행 입력. payload 는 재개에 필요한 전부여야 한다(정의 작성자의 책임) */
export interface RunSagaInput {
  organizationId: number;
  ownerUserId: number;
  // 멱등키(없으면 null). 있으면 같은 키의 사가가 하나뿐임을 저장소가 보장한다.
  clientRequestId: string | null;
  payload: Record<string, unknown>;
}

/**
 * 사가 오케스트레이터
 *
 * 하는 일은 셋뿐이다. (1) 단계를 순서대로 실행하고 매 단계 직후 진행 상태를 적는다,
 * (2) 실패하면 지금까지의 단계를 역순으로 보상한다, (3) 중단된 인스턴스를 그 지점부터 이어 간다.
 *
 * 도메인 지식을 갖지 않는다. 무엇을 하는 단계인지, 무엇을 되돌리는지는 전부 정의(SagaDefinition)에
 * 있다. 그래서 새 다단계 쓰기가 늘어도 이 파일은 그대로다.
 *
 * 에러를 감싸지 않는다. 단계가 던진 예외를 그대로 올린다(보상 후). 그러지 않으면 컨트롤러의
 * 상태코드 매핑(BadRequest/NotFound)이 전부 500 으로 바뀐다.
 */
export class SagaRunner {
  constructor(
    private readonly store: SagaStorePort,
    // 로그는 포트로 받는다: 코어가 특정 프레임워크의 Logger 를 알면 그 프레임워크에 묶인다.
    private readonly logger: SagaLogger = silentSagaLogger,
  ) {}

  /**
   * 사가를 실행한다(또는 이미 만들어진 결과를 그대로 돌려준다)
   *
   * 한 사가는 한 번에 한 실행만 돈다. 같은 멱등키의 두 요청이 겹치면 하나가 실행권을 잡고, 다른
   * 하나는 그것이 끝나기를 기다렸다가 같은 결과를 돌려받는다. 이 규칙이 없으면 두 요청이 같은 사가를
   * 함께 실행해 남은 단계를 각자 한 번씩 수행한다(유료 잡이 둘, 그중 하나는 아무도 폴링하지 않는 고아)
   *
   * 그래서 중복 제출의 답은 요청이 순차든 동시든 하나다: 처음 만들어진 그 산출물. 사용자는 두 번
   * 눌렀다는 사실을 화면에서 알 수 없고, 그것이 의도다.
   */
  async run<Ctx extends object>(
    definition: SagaDefinition<Ctx>,
    input: RunSagaInput,
    waiting: WaitOptions = {},
  ): Promise<SagaOutcome<Ctx>> {
    // payload/context 는 jsonb 로 영구 저장된다: 담을 수 없는 값(자격증명, JSON 왕복 불가)을
    //   저장 전에 막는다. 규칙 상세와 근거는 saga-context.ts.
    assertStorableSagaData(input.payload, 'payload');
    let instance = await this.store.startOrGet({
      organizationId: input.organizationId,
      ownerUserId: input.ownerUserId,
      sagaType: definition.type,
      clientRequestId: input.clientRequestId,
      payload: input.payload,
    });

    // 최대 두 번 돈다: 1회차에 남의 실행을 기다렸고 그것이 되돌아갔으면(COMPENSATED) 2회차가 처음부터
    //   다시 시도한다. 그 이상 반복하지 않는다(끝없이 서로를 기다리는 상태를 만들지 않는다)
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      // 빠른 길: 이미 끝난 사가면 실행권도 필요 없다(쓰기 한 번도 하지 않는다). 순차 재시도와
      //   더블클릭 대부분이 여기서 답을 받는다.
      if (instance.status === 'COMPLETED') {
        return {
          context: definition.hydrate(instance.payload, instance.context),
          alreadyCompleted: true,
        };
      }

      if (await this.store.tryAcquire(instance.id, SAGA_LEASE_MS)) {
        try {
          // 실행권을 잡은 뒤에 다시 읽는다. 잡기 전의 instance 는 이미 낡았을 수 있다(그 사이 다른
          //   실행이 단계를 진행했거나 끝냈다). 낡은 step 으로 시작하면 끝난 단계를 되풀이한다.
          let current = (await this.store.findById(instance.id)) ?? instance;
          if (current.status === 'COMPLETED') {
            return {
              context: definition.hydrate(current.payload, current.context),
              alreadyCompleted: true,
            };
          }
          // COMPENSATED = 이전 시도가 실패해 되돌아간 사가. 같은 키로 다시 왔으면 처음부터 다시 시도한다.
          //   (되돌린 뒤이므로 남은 부수효과가 없다). 상태를 RUNNING 으로 되돌리고 0단계부터
          //   실행권 안에서 되돌린다: 밖에서 하면 동시에 온 두 요청이 각자 0단계로 리셋한다.
          if (current.status === 'COMPENSATED') {
            await this.store.advance(current.id, 0, {});
            await this.store.setStatus(current.id, 'RUNNING', null);
            current = { ...current, step: 0, context: {}, status: 'RUNNING', error: null };
          }
          return {
            context: await this.execute(definition, current),
            alreadyCompleted: false,
          };
        } finally {
          // 성공이든 보상이든 놓는다. 놓지 않으면 기다리는 쪽이 리스 만료까지 붙잡힌다.
          await this.store.release(instance.id);
        }
      }

      const settled = await this.awaitSettled(instance.id, waiting);
      if (!settled) throw new SagaBusyError(definition.type);
      instance = settled;
    }

    throw new SagaBusyError(definition.type);
  }

  /**
   * 다른 실행이 끝나기를 기다린다. 끝나면 그 인스턴스, 시간 안에 끝나지 않으면 null.
   *
   * 폴링으로 기다리는 이유: DB 잠금으로 직렬화하면 벤더 HTTP 호출을 트랜잭션 안에 가두게 된다(오래 열린
   * 트랜잭션). 이 사가들은 짧아서(수백 ms ~ 수 초) 짧은 폴링이 더 안전하다.
   */
  private async awaitSettled(
    id: number,
    { budgetMs = SAGA_WAIT_BUDGET_MS, pollMs = SAGA_WAIT_POLL_MS }: WaitOptions,
  ): Promise<SagaInstance | null> {
    const deadline = Date.now() + budgetMs;
    for (;;) {
      const row = await this.store.findById(id);
      if (!row || !NON_TERMINAL_SAGA_STATUSES.includes(row.status)) return row;
      if (Date.now() >= deadline) return null;
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  /**
   * 중단된 인스턴스를 이어 간다(복구 러너가 부른다)
   *
   * 전진 복구를 택한다. 세 흐름 모두 남은 단계가 값이 있고(확정, 잡 등록) 그 단계들이 재실행에
   * 안전하다. 되돌리는 쪽을 택하면 사용자가 만든 것이 사라지는데, 크래시는 사용자의 실수가 아니다.
   * 남은 단계가 실패하면 그때 보상한다(정상 실패 경로와 같다)
   */
  async resume<Ctx extends object>(
    definition: SagaDefinition<Ctx>,
    instance: SagaInstance,
  ): Promise<void> {
    if (instance.status === 'COMPENSATING') {
      // 보상 중에 죽은 인스턴스: 남은 보상을 이어서 끝낸다(전진할 수 없다. 이미 되돌리기로 결정됐다)
      const ctx = definition.hydrate(instance.payload, instance.context);
      await this.compensate(definition, instance.id, ctx, instance.step);
      await this.store.setStatus(instance.id, 'COMPENSATED', instance.error);
      return;
    }
    await this.execute(definition, instance);
  }

  /** 단계 실행 루프 + 실패 시 보상. 성공하면 최종 컨텍스트를 돌려준다. */
  private async execute<Ctx extends object>(
    definition: SagaDefinition<Ctx>,
    instance: SagaInstance,
  ): Promise<Ctx> {
    let context = instance.context;
    let ctx = definition.hydrate(instance.payload, context);

    for (let i = instance.step; i < definition.steps.length; i += 1) {
      const step = definition.steps[i];
      try {
        const produced = await step.execute(ctx, stepMeta(instance.id, i, step.name));
        context = { ...context, ...(produced as Record<string, unknown>) };
        assertStorableSagaData(context, 'context');
        // 실행 직후 한 번의 쓰기로 step + context 를 함께 남긴다. 이 쓰기 전에 죽으면 이 단계가
        //   한 번 더 돈다(단계가 재실행에 안전해야 하는 이유). 나눠 쓰면 어긋난 지점에서 재개한다.
        await this.store.advance(instance.id, i + 1, context);
        ctx = definition.hydrate(instance.payload, context);
      } catch (err) {
        await this.rollback(definition, instance, ctx, i, err);
        throw err; // 원래 예외를 그대로: 컨트롤러의 상태코드 매핑을 보존한다
      }
    }

    await this.store.setStatus(instance.id, 'COMPLETED', null);
    return ctx;
  }

  /** i 단계에서 실패했다: 0..i-1 을 역순으로 보상하고 상태를 남긴다. */
  private async rollback<Ctx extends object>(
    definition: SagaDefinition<Ctx>,
    instance: SagaInstance,
    ctx: Ctx,
    failedIndex: number,
    err: unknown,
  ): Promise<void> {
    const reason = err instanceof Error ? err.message : String(err);
    this.logger.warn(
      `사가 실패: ${definition.type}#${instance.id} 단계 ${failedIndex}(${definition.steps[failedIndex]?.name}): ${reason}`,
    );
    // 보상 중 크래시를 대비해 먼저 상태를 적는다. 그러면 복구 러너가 전진이 아니라 보상을 이어 간다.
    await this.store.setStatus(instance.id, 'COMPENSATING', reason);
    await this.compensate(definition, instance.id, ctx, failedIndex);
    await this.store.setStatus(instance.id, 'COMPENSATED', reason);
  }

  /**
   * upTo 직전 단계부터 0번까지 역순 보상. 개별 보상 실패는 삼키고 경고만 남긴다.
   *
   * 삼키는 이유: 한 보상이 실패했다고 나머지를 멈추면 되돌릴 수 있었던 것까지 남는다. 남은 흔적은
   * 경고가 유일한 추적 근거다(자산 삭제 실패와 같은 취급)
   */
  private async compensate<Ctx extends object>(
    definition: SagaDefinition<Ctx>,
    instanceId: number,
    ctx: Ctx,
    upTo: number,
  ): Promise<void> {
    for (let j = Math.min(upTo, definition.steps.length) - 1; j >= 0; j -= 1) {
      const step = definition.steps[j];
      if (!step.compensate) continue;
      try {
        await step.compensate(ctx, stepMeta(instanceId, j, step.name));
      } catch (err) {
        this.logger.warn(
          `사가 보상 실패: ${definition.type} 단계 ${j}(${step.name}): ${String(err)}. 그 단계의 흔적이 남습니다.`,
        );
      }
    }
  }
}
