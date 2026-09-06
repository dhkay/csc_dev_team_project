import { describe, it, expect, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/pg-proxy';
import { sagaTable } from '../drizzle/saga-table';
import { createDrizzleSagaStore } from '../drizzle/saga-store';

/**
 * 저장소가 실제로 내보내는 SQL 을 고정한다.
 *
 * 손으로 짠 문장이 셋 있다(실행권 획득, 중단분 claim, 보존기간 정리). 셋 다 "조건으로 대상을 고르고 같은
 * 문장이 갱신/삭제한다" 는 관용이고, 조회와 쓰기를 나누면 그 틈으로 두 실행이 통과해 같은 사가를 함께
 * 돌린다. 그 성질은 타입이 아니라 SQL 모양에 있어서, 깨져도 컴파일은 통과하고 동시 요청이 들어오는
 * 날에만 드러난다.
 *
 * 문장을 테스트에서 다시 짜지 않고 저장소를 호출해 나가는 SQL 을 붙잡는다(pg-proxy 드라이버)
 * 다시 짜면 테스트와 구현이 각자 갈 수 있다.
 */
describe('Drizzle 사가 저장소 SQL', () => {
  const table = sagaTable('test_sagas');
  let sent: { sql: string; params: unknown[] }[];
  let store: ReturnType<typeof createDrizzleSagaStore>;

  beforeEach(() => {
    sent = [];
    // 연결하지 않는 드라이버: 나가는 문장을 기록하고 빈 결과를 돌려준다.
    const db = drizzle(async (sql, params) => {
      sent.push({ sql, params });
      return { rows: [] };
    });
    store = createDrizzleSagaStore(db, table);
  });

  it('실행권 획득은 조건부 UPDATE 한 문장이다', async () => {
    await store.tryAcquire(1, 30_000);

    expect(sent).toHaveLength(1);
    const { sql } = sent[0];
    expect(sql).toMatch(/^update "test_sagas" set/);
    expect(sql).toContain('"claimed_at" =');
    // 조회와 갱신이 나뉘면 그 틈으로 두 실행이 모두 통과한다.
    expect(sql).toMatch(
      /where \("test_sagas"\."id" = \$\d+ and \("test_sagas"\."claimed_at" is null or/,
    );
    // RETURNING 이 있어야 "내가 집었는지" 를 알 수 있다(영향 행 수에 의존하지 않는다)
    expect(sql).toContain('returning');
  });

  it('진행 기록이 실행권도 같은 문장에서 갱신한다', async () => {
    await store.advance(1, 2, { a: 1 });

    expect(sent).toHaveLength(1);
    const { sql } = sent[0];
    expect(sql).toContain('"step" =');
    expect(sql).toContain('"context" =');
    // claimed_at 이 빠지면 리스가 "사가 전체" 의 상한이 되어, 느린 사가가 살아 있는데도 실행권을 잃는다.
    expect(sql).toContain('"claimed_at" =');
  });

  it('중단분 claim 은 조회와 claim 을 한 문장으로 한다', async () => {
    await store.claimStale(new Date('2026-08-20T00:00:00Z'), 20);

    expect(sent).toHaveLength(1);
    const { sql } = sent[0];
    expect(sql).toMatch(/^update "test_sagas" set/);
    expect(sql).toMatch(/where "test_sagas"\."id" in \(select/);
    // 오래 방치된 것부터. 없으면 특정 사가가 매번 뒤로 밀린다.
    expect(sql).toContain('order by "test_sagas"."updated_at" asc');
    expect(sql).toContain('limit');
  });

  it('보존기간 정리는 종료 상태만 지운다', async () => {
    await store.deleteSettledBefore(new Date('2026-08-20T00:00:00Z'), 500);

    expect(sent).toHaveLength(1);
    const { sql, params } = sent[0];
    expect(sql).toMatch(/^delete from "test_sagas"/);
    expect(sql).toMatch(/where "test_sagas"\."id" in \(select/);
    // 진행 중 상태가 조건에 섞이면 이어 갈 사가를 지운다.
    expect(params).toContain('COMPLETED');
    expect(params).toContain('COMPENSATED');
    expect(params).not.toContain('RUNNING');
    expect(params).not.toContain('COMPENSATING');
  });

  it('멱등키 조회는 부분 유니크와 같은 네 열로 찾는다', async () => {
    // 빈 결과를 돌려주는 드라이버라 INSERT 뒤 매핑은 실패한다. 여기서 보는 것은 첫 문장이다.
    await store
      .startOrGet({
        organizationId: 10,
        ownerUserId: 7,
        sagaType: 'x.y',
        clientRequestId: 'k1',
        payload: {},
      })
      .catch(() => undefined);

    // 첫 문장이 사전 조회다(열이 인덱스와 어긋나면 인덱스를 못 쓴다)
    const { sql } = sent[0];
    expect(sql).toContain('"organization_id" =');
    expect(sql).toContain('"owner_user_id" =');
    expect(sql).toContain('"saga_type" =');
    expect(sql).toContain('"client_request_id" =');
  });
});