import { and, asc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

/**
 * 이 저장소가 db 에게 요구하는 전부
 *
 * 전체 `PgDatabase` 를 요구하지 않는 이유: 그 타입은 drizzle 판올림마다 멤버가 붙는다(예: `$cache`)
 * 요구해 두면 앱이 drizzle 을 올리거나 내리는 순간, 이 패키지와 앱이 서로 다른 판의 같은 이름을 보게 되어
 * "쓰지도 않는 멤버가 없다" 는 이유로 컴파일이 깨진다. 실제로 쓰는 네 메서드만 요구하면 그 결합이 사라진다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SagaDrizzleDb = Pick<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PgDatabase<PgQueryResultHKT, any, any>,
  'select' | 'insert' | 'update' | 'delete'
>;
import {
  NON_TERMINAL_SAGA_STATUSES,
  TERMINAL_SAGA_STATUSES,
  SagaInstance,
  SagaStatus,
  SagaStorePort,
  StartSagaInput,
} from '@csc/saga';
import type { SagaTable } from './saga-table';

type SagaRow = SagaTable['$inferSelect'];

/** Drizzle row → 도메인 인스턴스. jsonb 는 형태를 보장하지 않아 읽는 쪽에서 좁힌다. */
function toInstance(row: SagaRow): SagaInstance {
  return {
    id: row.id,
    organizationId: row.organizationId,
    ownerUserId: row.ownerUserId,
    sagaType: row.sagaType,
    clientRequestId: row.clientRequestId ?? null,
    status: row.status as SagaStatus,
    step: row.step,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    context: (row.context ?? {}) as Record<string, unknown>,
    error: row.error ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Drizzle 로 사가 저장소를 만든다. 앱은 자기 db 와 자기 표를 넘긴다.
 *
 * ```ts
 * const store = createDrizzleSagaStore(marketingDb, marketingSagas);
 * ```
 *
 * 손으로 짠 문장이 셋 있다(실행권 획득, 중단분 claim, 보존기간 정리). 셋 다 "조건으로 대상을 고르고
 * 같은 문장이 갱신/삭제한다" 는 관용이며, 조회와 쓰기를 나누면 그 틈으로 두 실행이 통과해 같은 사가를
 * 함께 돌린다. 앱마다 다시 짜지 않고 여기 한 번만 두는 이유가 그것이다.
 */
export function createDrizzleSagaStore(
  db: SagaDrizzleDb,
  table: SagaTable,
): SagaStorePort {
  return new DrizzleSagaStore(db, table);
}

class DrizzleSagaStore implements SagaStorePort {
  constructor(
    private readonly db: SagaDrizzleDb,
    private readonly table: SagaTable,
  ) {}

  async startOrGet(input: StartSagaInput): Promise<SagaInstance> {
    if (input.clientRequestId) {
      const existing = await this.findByRequest(input);
      if (existing) return existing;
    }
    try {
      const [row] = await this.db
        .insert(this.table)
        .values({
          organizationId: input.organizationId,
          ownerUserId: input.ownerUserId,
          sagaType: input.sagaType,
          clientRequestId: input.clientRequestId,
          status: 'RUNNING',
          step: 0,
          payload: input.payload,
          context: {},
        })
        .returning();
      return toInstance(row);
    } catch (err) {
      // 경합: 사전 조회를 통과한 두 요청이 동시에 INSERT 하면 하나는 부분 유니크에 걸린다.
      //   드라이버 에러 코드를 보지 않고 다시 조회해서 있으면 충돌로 본다(그 행이 답이다)
      if (!input.clientRequestId) throw err;
      const existing = await this.findByRequest(input);
      if (!existing) throw err;
      return existing;
    }
  }

  async advance(
    id: number,
    step: number,
    context: Record<string, unknown>,
  ): Promise<void> {
    // step 과 context 를 한 문장으로 남긴다(나누면 어긋난 지점에서 재개한다)
    //   claimed_at 도 같은 문장에서 미룬다: 진행이 있었다는 것이 곧 실행이 살아 있다는 증거다.
    //   덕분에 리스는 사가 전체가 아니라 한 단계의 상한이 된다(왕복이 늘지 않는다)
    const now = new Date();
    await this.db
      .update(this.table)
      .set({ step, context, updatedAt: now, claimedAt: now })
      .where(eq(this.table.id, id));
  }

  async setStatus(id: number, status: SagaStatus, error: string | null): Promise<void> {
    await this.db
      .update(this.table)
      .set({ status, error, updatedAt: new Date() })
      .where(eq(this.table.id, id));
  }

  async findById(id: number): Promise<SagaInstance | null> {
    const [row] = await this.db
      .select()
      .from(this.table)
      .where(eq(this.table.id, id))
      .limit(1);
    return row ? toInstance(row) : null;
  }

  async tryAcquire(id: number, leaseMs: number): Promise<boolean> {
    // 조건부 UPDATE 한 문장: 비어 있거나 리스가 만료된 실행권만 집는다. RETURNING 이 비면 남이 들고 있다.
    //   claimStale 과 같은 컬럼(claimed_at)을 쓴다: "지금 이 사가를 누가 돌리고 있나" 라는 질문이 하나뿐인데
    //   두 컬럼으로 나누면 요청 경로와 복구 경로가 서로의 실행을 못 보고 같은 사가를 함께 돌린다.
    const cutoff = new Date(Date.now() - leaseMs);
    const rows = await this.db
      .update(this.table)
      .set({ claimedAt: new Date() })
      .where(
        and(
          eq(this.table.id, id),
          or(isNull(this.table.claimedAt), lt(this.table.claimedAt, cutoff)),
        ),
      )
      .returning({ id: this.table.id });
    return rows.length > 0;
  }

  async release(id: number): Promise<void> {
    await this.db
      .update(this.table)
      .set({ claimedAt: null })
      .where(eq(this.table.id, id));
  }

  async claimStale(cutoff: Date, limit: number): Promise<SagaInstance[]> {
    // 조회와 claim 을 한 문장으로: 서브쿼리로 대상을 고르고 같은 UPDATE 가 claimed_at 을 찍는다.
    //   나누면 그 틈에 다른 러너가 같은 행을 집어 같은 사가를 두 번 돌린다.
    //   claimed_at 조건이 함께 있어야 방금 집힌 행을 다시 집지 않는다.
    //
    //   잠금이 아니라 중복을 좁히는 장치다. 러너가 여럿일 때 두 UPDATE 는 행 잠금에서 직렬화되고
    //   뒤에 온 쪽은 갱신된 claimed_at 을 보고 그 행을 뺀다. 다만 그것은 격리 수준에 기댄 성질이라
    //   완전한 배제로 보지 않는다. 같은 사가가 두 번 돌아도 안전한 근거는 단계의 재실행 안전성
    //   (사가 계약)이고, 이 claim 은 그 위에 얹는 낭비 방지다. 더 강한 배제가 필요해지면
    //   SELECT ... FOR UPDATE SKIP LOCKED 로 바꾼다(그때는 문장이 둘로 갈리므로 트랜잭션이 필요하다)
    const candidates = this.db
      .select({ id: this.table.id })
      .from(this.table)
      .where(
        and(
          inArray(this.table.status, [...NON_TERMINAL_SAGA_STATUSES]),
          lt(this.table.updatedAt, cutoff),
          or(isNull(this.table.claimedAt), lt(this.table.claimedAt, cutoff)),
        ),
      )
      .orderBy(asc(this.table.updatedAt))
      .limit(limit);

    const rows = await this.db
      .update(this.table)
      .set({ claimedAt: new Date() })
      .where(inArray(this.table.id, candidates))
      .returning();
    return rows.map(toInstance).sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
  }

  async deleteSettledBefore(cutoff: Date, limit: number): Promise<number> {
    // claimStale 과 같은 관용: 서브쿼리로 대상을 고르고(limit 이 필요하다) 그 id 들을 지운다.
    //   비종료 상태는 조건에서 빠지므로 진행 중인 사가는 어떤 경우에도 지워지지 않는다.
    const candidates = this.db
      .select({ id: this.table.id })
      .from(this.table)
      .where(
        and(
          inArray(this.table.status, [...TERMINAL_SAGA_STATUSES]),
          lt(this.table.updatedAt, cutoff),
        ),
      )
      .orderBy(asc(this.table.updatedAt))
      .limit(limit);

    const rows = await this.db
      .delete(this.table)
      .where(inArray(this.table.id, candidates))
      .returning({ id: this.table.id });
    return rows.length;
  }

  private async findByRequest(input: StartSagaInput): Promise<SagaInstance | null> {
    if (!input.clientRequestId) return null;
    // 부분 유니크와 같은 4열로 찾는다(그 인덱스를 그대로 쓴다)
    const [row] = await this.db
      .select()
      .from(this.table)
      .where(
        and(
          eq(this.table.organizationId, input.organizationId),
          eq(this.table.ownerUserId, input.ownerUserId),
          eq(this.table.sagaType, input.sagaType),
          eq(this.table.clientRequestId, input.clientRequestId),
        ),
      )
      .limit(1);
    return row ? toInstance(row) : null;
  }
}

