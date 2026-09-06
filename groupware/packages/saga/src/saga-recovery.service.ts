import { SagaLogger, silentSagaLogger } from './saga-logger';
import { SagaRunner } from './saga-runner';
import { SagaStorePort } from './saga-store.port';
import { NON_TERMINAL_SAGA_STATUSES, SagaDefinition, SagaInstance } from './saga.types';

/** 중단된 사가로 보기까지의 유예(ms). 정상 실행 중인 사가를 러너가 가로채지 않을 만큼 넉넉히 둔다. */
export const SAGA_STALE_AFTER_MS = 5 * 60 * 1000;
/** 한 번에 이어 가는 최대 인스턴스 수. 큰 백로그가 한 틱을 오래 잡지 않게 나눠 처리한다. */
export const SAGA_RECOVERY_BATCH_LIMIT = 20;
/**
 * 끝난 사가를 보관하는 기간(ms)
 *
 * 이 표는 쓰기 시도마다 한 행이 생겨 정리하지 않으면 무한히 자란다. 그렇다고 바로 지우지는 않는다:
 * 사고를 조사할 때 "그 저장이 어느 단계에서 되돌아갔는가" 를 답하는 유일한 기록이다. 한 달이면 그
 * 조사가 끝나고, 사용자에게 보이는 흔적은 활동 원장이 따로 갖는다.
 */
export const SAGA_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** 한 틱에 지우는 최대 행 수. 오래 밀린 정리가 한 문장으로 큰 잠금을 잡지 않게 나눈다. */
export const SAGA_PRUNE_BATCH_LIMIT = 500;

/** 복구 1회의 결과 */
export interface SagaRecoveryResult {
  // 더는 걸려 있지 않게 된 인스턴스 수. 끝까지 간 것과 되돌려진 것을 함께 센다.
  //
  // 둘을 나누지 않는 이유: 이 수가 답해야 하는 질문은 "중간 상태가 남았나" 이고, 되돌려진 사가는
  // 남기지 않았다. 무엇이 되돌려졌는지는 사가 행의 상태(COMPENSATED)와 로그가 말한다.
  recovered: number;
  // 이어 가려다 다시 실패한 수. 다음 틱이 재시도한다.
  failed: number;
  // 정의를 찾지 못해 건너뛴 수(배포로 사라진 사가 종류)
  skipped: number;
}

/**
 * 사가 복구 러너: 중단된 인스턴스를 그 지점부터 이어 간다.
 *
 * 이것이 오케스트레이션의 완성 조각이다. 단계별 보상만 있으면 프로세스가 살아 있을 때만 되돌려진다.
 * 배포 재시작이나 OOM 으로 단계 사이에서 죽으면 중간 상태가 영구히 남는다(잡 없이 멈춘 예약 행,
 * 확정되지 않은 자산을 가리키는 저장본). 그 인스턴스를 다시 집어 남은 단계를 실행하는 주체가 여기다.
 *
 * 정의는 주입받는다(SAGA_DEFINITIONS). 새 사가가 늘어도 이 파일은 그대로다: 도메인 모듈이 정의를
 * 내보내고 SagaRecoveryModule 이 모아 준다.
 *
 * claim 은 중복 실행을 좁힌다(막는다고 보지 않는다). 저장소가 조회와 claim 을 한 문장으로 하므로
 * 러너가 여럿이어도 같은 사가를 동시에 집는 일이 드물다. 그래도 안전의 근거는 claim 이 아니라 단계의
 * 재실행 안전성(사가 계약)이다: 같은 사가가 두 번 돌아도 결과가 같아야 한다.
 */
export class SagaRecoveryService {
  private readonly byType: Map<string, SagaDefinition<object>>;
  /** 이번 틱이 아직 돌고 있으면 다음 틱을 건너뛴다(느린 복구가 겹쳐 쌓이지 않게) */
  private running = false;

  constructor(
    private readonly store: SagaStorePort,
    private readonly runner: SagaRunner,
    definitions: readonly SagaDefinition<object>[],
    private readonly logger: SagaLogger = silentSagaLogger,
  ) {
    this.byType = new Map(definitions.map((d) => [d.type, d]));
    this.logger.log(
      `사가 복구 대상 정의 ${this.byType.size}종: ${[...this.byType.keys()].join(', ') || '(없음)'}`,
    );
  }

  /**
   * 중단된 사가를 한 배치 이어 간다.
   *
   * 실패는 삼킨다: 한 인스턴스가 계속 실패해도 나머지가 막히면 안 되고, 그 실패는 사가 자체의 상태
   * (COMPENSATING/COMPENSATED)와 경고로 남는다. 다음 틱이 다시 시도한다.
   */
  async recoverStale(
    staleAfterMs: number = SAGA_STALE_AFTER_MS,
    limit: number = SAGA_RECOVERY_BATCH_LIMIT,
  ): Promise<SagaRecoveryResult> {
    const cutoff = new Date(Date.now() - staleAfterMs);
    const instances = await this.store.claimStale(cutoff, limit);
    const result: SagaRecoveryResult = { recovered: 0, failed: 0, skipped: 0 };

    for (const instance of instances) {
      const definition = this.byType.get(instance.sagaType);
      if (!definition) {
        // 배포로 사라진 사가 종류. 정의 없이는 단계도 보상도 모르므로 손대지 않고 남긴다.
        //   (지우면 되돌리지 못한 부수효과의 유일한 기록을 잃는다)
        result.skipped += 1;
        this.logger.warn(
          `정의를 모르는 사가를 건너뜁니다: ${instance.sagaType}#${instance.id}`,
        );
        continue;
      }
      let error: unknown = null;
      try {
        await this.resume(definition, instance);
      } catch (err) {
        // 러너는 보상까지 끝낸 뒤에도 원래 예외를 다시 던진다(호출부의 상태코드 번역을 살리려고)
        //   그래서 성패는 예외 유무가 아니라 남은 상태로 판정한다: 아래에서 다시 읽는다.
        error = err;
      }
      const settled = await this.store.findById(instance.id);
      // 끝났거나 되돌려졌으면 더는 걸려 있지 않다. 되돌림도 복구다(중간 상태가 남지 않았다)
      if (!settled || !NON_TERMINAL_SAGA_STATUSES.includes(settled.status)) {
        result.recovered += 1;
        if (error) {
          this.logger.log(
            `사가를 되돌렸습니다: ${instance.sagaType}#${instance.id}: ${String(error)}`,
          );
        }
        continue;
      }
      result.failed += 1;
      this.logger.warn(
        `사가 복구 실패(다음 주기에 재시도): ${instance.sagaType}#${instance.id}: ${String(error)}`,
      );
    }
    if (result.recovered > 0 || result.failed > 0 || result.skipped > 0) {
      this.logger.log(
        `사가 복구: 이어감 ${result.recovered}, 실패 ${result.failed}, 건너뜀 ${result.skipped}`,
      );
    }
    return result;
  }

  /**
   * 그 종류의 사가를 이어 갈 수 있는지
   *
   * 배선 확인용이다. 정의를 만들고 SagaRecoveryModule 배열에 넣는 것을 잊으면 그 사가는 중단됐을 때
   * 방치되므로(경고만 남는다), 조립 테스트가 이 값으로 확인한다.
   */
  knows(sagaType: string): boolean {
    return this.byType.has(sagaType);
  }

  /**
   * 끝난 사가를 보존기간 뒤에 지운다. 지운 행 수를 돌려준다.
   *
   * 진행 중인 것은 대상이 아니다(저장소가 종료 상태만 고른다). 그래서 이 정리가 복구를 방해하지 않는다.
   */
  async pruneSettled(
    retentionMs: number = SAGA_RETENTION_MS,
    limit: number = SAGA_PRUNE_BATCH_LIMIT,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - retentionMs);
    const deleted = await this.store.deleteSettledBefore(cutoff, limit);
    if (deleted > 0) this.logger.log(`끝난 사가 ${deleted}건을 정리했습니다.`);
    return deleted;
  }

  /** 스케줄러가 부르는 틱. 겹치면 건너뛴다(복구가 느릴 때 틱이 쌓이지 않게) */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.recoverStale();
      // 정리는 복구 뒤에 둔다. 순서가 결과를 바꾸지는 않지만(대상 집합이 겹치지 않는다) 복구가
      //   틱의 목적이고 정리는 곁일이라, 정리가 실패해도 복구는 이미 끝나 있다.
      await this.pruneSettled();
    } catch (err) {
      // 틱 자체의 실패(저장소 도달 불가 등)가 스케줄러를 죽이지 않게 삼킨다.
      this.logger.warn(`사가 복구 틱 실패: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }

  private resume(
    definition: SagaDefinition<object>,
    instance: SagaInstance,
  ): Promise<void> {
    return this.runner.resume(definition, instance);
  }
}
