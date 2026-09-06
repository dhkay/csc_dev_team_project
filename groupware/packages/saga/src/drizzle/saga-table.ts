import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * 사가 진행 상태 표를 만든다. 앱마다 자기 DB 에 하나 둔다(표 이름만 다르다).
 *
 * 정의를 공유하는 이유는 러너의 의미가 이 컬럼들에 걸려 있기 때문이다. `step`+`context` 가 재개
 * 지점이고 `claimed_at` 이 실행권이며 부분 유니크가 멱등키를 하나로 만든다. 앱이 표를 손으로
 * 다시 적으면 그중 하나가 조용히 빠지고, 그 사실은 동시 요청이 들어오는 날에야 드러난다.
 *
 * 마이그레이션은 그 DB 를 소유한 앱이 생성한다. 이 함수는 스키마 정의일 뿐이다. 인덱스 이름은
 * 표 이름에서 파생되므로 앱마다 충돌하지 않는다.
 */
export function sagaTable(tableName: string) {
  return pgTable(
    tableName,
    {
      id: serial('id').primaryKey(),
      organizationId: integer('organization_id').notNull(),
      ownerUserId: integer('owner_user_id').notNull(),
      // 사가 종류. 코드의 정의 key 와 같다(복구가 이 값으로 정의를 찾는다)
      sagaType: varchar('saga_type', { length: 64 }).notNull(),
      // 요청 멱등키(없으면 null). 같은 키는 사가 하나
      clientRequestId: varchar('client_request_id', { length: 120 }),
      // RUNNING | COMPLETED | COMPENSATING | COMPENSATED. 값 공간 SSOT 는 코어의 SagaStatus.
      status: varchar('status', { length: 16 }).notNull().default('RUNNING'),
      // 완료된 단계 수. 재개는 이 인덱스부터 실행한다.
      step: integer('step').notNull().default(0),
      // 사가 입력(재개에 필요한 전부). 단계가 이것만 보고 다시 실행될 수 있어야 한다.
      payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
      // 단계 산출물 누적(행 id, 잡 id 등). 재개가 앞 단계를 되풀이하지 않는 근거
      context: jsonb('context').$type<Record<string, unknown>>().notNull(),
      // 마지막 실패 사유(보상/실패 시). 성공하면 null 로 되돌린다.
      error: text('error'),
      // 실행권. 살아 있는 실행이 들고 있다는 표시이고 진행 기록마다 갱신된다.
      //
      // 요청 경로와 복구 경로가 같은 컬럼을 쓴다: "지금 이 사가를 누가 돌리고 있나" 는 질문이
      // 하나뿐이라 답을 적는 자리도 하나여야 한다. 나누면 서로의 실행을 보지 못한다.
      claimedAt: timestamp('claimed_at', { withTimezone: true }),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
      // 같은 요청은 사가 하나. null 은 서로 다르게 취급되므로 키 없는 사가는 막지 않는다.
      requestUq: uniqueIndex(`${tableName}_request_uq`)
        .on(t.organizationId, t.ownerUserId, t.sagaType, t.clientRequestId)
        .where(sql`${t.clientRequestId} is not null`),
      // 복구 조회와 보존기간 정리가 같이 쓴다: status 등호가 앞, updated_at 이 범위/정렬
      staleIdx: index(`${tableName}_stale_idx`).on(t.status, t.updatedAt),
    }),
  );
}

/** `sagaTable` 이 만든 표의 타입. 저장소 팩토리가 이 타입을 요구한다. */
export type SagaTable = ReturnType<typeof sagaTable>;
