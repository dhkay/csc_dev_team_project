import type { Provider } from '@nestjs/common';
import {
  NON_TERMINAL_SAGA_STATUSES,
  SagaInstance,
  SagaRunner,
  SagaStatus,
  SagaStorePort,
  StartSagaInput,
  TERMINAL_SAGA_STATUSES,
  SAGA_STORE_PORT,
} from '@csc/saga';

/**
 * 인메모리 사가 저장소(테스트용)
 *
 * 사가를 쓰는 서비스 테스트는 러너를 mock 하지 않고 진짜 러너 + 이 저장소로 돈다. 그래야
 * 단계 순서와 보상이 테스트 대상에 포함된다(러너를 mock 하면 정의가 검증되지 않는다)
 */
export class InMemorySagaStore implements SagaStorePort {
  rows = new Map<number, SagaInstance>();
  /** claim 시각. SagaInstance 에는 없는 값이라(러너가 쓰지 않는다) 저장소 안에만 둔다. */
  private claims = new Map<number, Date>();
  // 저장 호출 순서 기록. "단계 직후 한 번" 을 검증하는 데 쓴다.
  writes: string[] = [];
  private seq = 0;

  async startOrGet(input: StartSagaInput): Promise<SagaInstance> {
    if (input.clientRequestId) {
      const found = [...this.rows.values()].find(
        (r) =>
          r.clientRequestId === input.clientRequestId &&
          r.sagaType === input.sagaType &&
          r.organizationId === input.organizationId &&
          r.ownerUserId === input.ownerUserId,
      );
      if (found) return found;
    }
    this.seq += 1;
    const instance: SagaInstance = {
      id: this.seq,
      organizationId: input.organizationId,
      ownerUserId: input.ownerUserId,
      sagaType: input.sagaType,
      clientRequestId: input.clientRequestId,
      status: 'RUNNING',
      step: 0,
      payload: input.payload,
      context: {},
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.rows.set(instance.id, instance);
    return instance;
  }

  async advance(id: number, step: number, context: Record<string, unknown>): Promise<void> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`없는 사가: ${id}`);
    // 진짜 어댑터와 같은 의미: 진행 기록이 실행권도 갱신한다(리스는 한 단계의 상한이다)
    const now = new Date();
    this.rows.set(id, { ...row, step, context, updatedAt: now });
    if (this.claims.has(id)) this.claims.set(id, now);
    this.writes.push(`advance:${step}`);
  }

  async setStatus(id: number, status: SagaStatus, error: string | null): Promise<void> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`없는 사가: ${id}`);
    this.rows.set(id, { ...row, status, error, updatedAt: new Date() });
    this.writes.push(`status:${status}`);
  }

  async findById(id: number): Promise<SagaInstance | null> {
    return this.rows.get(id) ?? null;
  }

  async tryAcquire(id: number, leaseMs: number): Promise<boolean> {
    // 진짜 어댑터와 같은 의미: 비어 있거나 리스가 만료된 실행권만 집는다.
    const held = this.claims.get(id);
    if (held && held.getTime() > Date.now() - leaseMs) return false;
    this.claims.set(id, new Date());
    return true;
  }

  async release(id: number): Promise<void> {
    this.claims.delete(id);
  }

  async claimStale(cutoff: Date, limit: number): Promise<SagaInstance[]> {
    // 진짜 어댑터와 같은 의미로 claim 한다: 방금 집힌 행은 다시 집지 않는다. 이 규칙이 빠지면
    //   복구 러너 테스트가 "한 사가를 두 번 돌리지 않는다" 를 검증하지 못한다.
    const picked = [...this.rows.values()]
      .filter((r) => {
        if (!NON_TERMINAL_SAGA_STATUSES.includes(r.status)) return false;
        if (r.updatedAt >= cutoff) return false;
        const claimedAt = this.claims.get(r.id);
        return !claimedAt || claimedAt < cutoff;
      })
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .slice(0, limit);
    const now = new Date();
    for (const row of picked) this.claims.set(row.id, now);
    return picked;
  }

  /** 크래시 재현: 그 사가를 지정한 단계까지만 끝난 상태로 만든다. */
  crashAt(id: number, step: number, context: Record<string, unknown>): void {
    const row = this.rows.get(id);
    if (!row) throw new Error(`없는 사가: ${id}`);
    this.rows.set(id, { ...row, step, context, status: 'RUNNING' });
  }

  async deleteSettledBefore(cutoff: Date, limit: number): Promise<number> {
    const doomed = [...this.rows.values()]
      .filter((r) => TERMINAL_SAGA_STATUSES.includes(r.status) && r.updatedAt < cutoff)
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .slice(0, limit);
    for (const row of doomed) {
      this.rows.delete(row.id);
      this.claims.delete(row.id);
    }
    return doomed.length;
  }

  /**
   * 중단 방치 재현: 시간이 그만큼 흐른 것으로 만든다(최종 수정 시각과 claim 시각을 함께 과거로)
   *
   * claim 도 같이 돌리는 것이 실제 모델이다. 시간이 흐르면 claim 도 낡고, 그래야 한 번 집혀 실패한
   * 사가가 다음 주기에 다시 집힌다(반대로 방금 집힌 것은 다시 집히지 않는다: 재시도 백오프)
   */
  backdate(id: number, ms: number): void {
    const row = this.rows.get(id);
    if (!row) throw new Error(`없는 사가: ${id}`);
    this.rows.set(id, { ...row, updatedAt: new Date(Date.now() - ms) });
    const claimedAt = this.claims.get(id);
    if (claimedAt) this.claims.set(id, new Date(claimedAt.getTime() - ms));
  }

  /** 마지막으로 시작된 사가(단일 사가 테스트의 편의) */
  latest(): SagaInstance {
    const rows = [...this.rows.values()];
    if (rows.length === 0) throw new Error('시작된 사가가 없습니다.');
    return rows[rows.length - 1];
  }
}

export const createInMemorySagaStore = (): InMemorySagaStore => new InMemorySagaStore();

/**
 * 테스트용 Nest 프로바이더 묶음
 *
 * 코어 러너는 데코레이터가 없는 순수 클래스라(프레임워크 비종속) DI 가 자동으로 만들지 못한다.
 * 앱 테스트마다 팩토리를 다시 적으면 그중 하나가 어긋났을 때 "store 가 undefined" 로만 드러나므로
 * 여기 한 번만 둔다. 배선 모양은 `SagaModule.forRoot` 와 같다.
 *
 * ```ts
 * providers: [MyService, MySaga, ...sagaTestProviders(createInMemorySagaStore())]
 * ```
 */
export function sagaTestProviders(store: SagaStorePort): Provider[] {
  return [
    { provide: SAGA_STORE_PORT, useValue: store },
    {
      provide: SagaRunner,
      useFactory: (s: SagaStorePort) => new SagaRunner(s),
      inject: [SAGA_STORE_PORT],
    },
  ];
}
