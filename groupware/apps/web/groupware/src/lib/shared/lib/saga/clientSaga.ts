/**
 * 브라우저 안에서 도는 다단계 동작의 사가 러너
 *
 * `@csc/saga` 를 쓰지 않는다. 그 패키지는 durable 오케스트레이터라 저장소와 실행권과 복구가
 * 프로세스가 죽어도 상태가 남는다는 전제 위에 선다. 브라우저에는 그 전제가 없다. 탭이 죽으면
 * 진행 중이던 요청은 저절로 끊기고 이어 갈 주체도 없다.
 *
 * 그래도 사가인 이유는 셋이 여기서도 필요하기 때문이다.
 *
 *   1. 순서: 단계 사이에 순서 제약이 있다(먼저 멈추고, 그다음에 걷어낸다)
 *   2. 실패하면 앞으로 가지 않는다: 이것이 없으면 멈추지 못했는데 화면에서는 사라진 상태가 생긴다.
 *   3. 역순 보상: 되돌릴 것이 있는 단계는 자기 것만 되돌린다.
 *
 * 계약도 그 패키지와 같게 맞춘다(`name` / `execute` / 선택적 `compensate`).
 *
 * 단계를 쓸 때:
 * - 산출물은 반환한다. 보상이 쓸 값을 클로저에 담지 말고 컨텍스트로 돌려준다.
 * - 보상은 자기 단계만 되돌린다. 순서는 러너가 역순으로 보장한다.
 * - 보상은 best-effort 다. 실패해도 나머지 보상은 계속하고, 결과에 실패 단계 이름을 담아 준다.
 */

/** 단계 하나. 되돌릴 것이 없는 단계는 `compensate` 를 두지 않는다(조회, 검증, 끊기 등) */
export interface ClientSagaStep<Ctx extends object> {
  // 단계 이름. 실패를 알릴 때와 로그에 쓴다.
  readonly name: string;
  /** 산출물을 컨텍스트 조각으로 돌려준다. 만드는 것이 없으면 아무것도 돌려주지 않는다. */
  execute(ctx: Ctx): Promise<Partial<Ctx> | void> | Partial<Ctx> | void;
  /** 이 단계가 만든 것을 되돌린다. */
  compensate?(ctx: Ctx): Promise<void> | void;
}

/** 사가 실행 결과. 실패면 어느 단계에서 멈췄는지까지 준다(호출부가 그것으로 알린다) */
export type ClientSagaOutcome<Ctx extends object> =
  | { readonly ok: true; readonly context: Ctx }
  | {
      readonly ok: false;
      readonly context: Ctx;
      readonly failedStep: string;
      readonly error: unknown;
    };

/**
 * 단계를 순서대로 실행하고, 실패하면 지금까지의 단계를 역순으로 보상한다.
 *
 * 던지지 않는다. 결과를 값으로 돌려준다: 호출부는 대개 화면 전환을 그 결과로 가르므로(성공이면
 * 넘어가고 실패면 그 자리에 머문다) try/catch 보다 분기가 곧다.
 */
export async function runClientSaga<Ctx extends object>(
  steps: readonly ClientSagaStep<Ctx>[],
  initial: Ctx,
): Promise<ClientSagaOutcome<Ctx>> {
  let context = initial;
  const done: ClientSagaStep<Ctx>[] = [];

  for (const step of steps) {
    try {
      const produced = await step.execute(context);
      // 산출물을 즉시 합친다. 다음 단계도 보상도 이 컨텍스트만 본다(클로저를 보지 않는다)
      if (produced) context = { ...context, ...produced };
      done.push(step);
    } catch (error) {
      for (const finished of done.reverse()) {
        try {
          await finished.compensate?.(context);
        } catch (compensationError) {
          // 보상 실패는 삼킨다: 하나가 실패했다고 나머지를 되돌리지 않으면 더 어긋난 상태가 남는다.
          console.warn(`[saga] 보상 실패: ${finished.name}`, compensationError);
        }
      }
      return { ok: false, context, failedStep: step.name, error };
    }
  }

  return { ok: true, context };
}
