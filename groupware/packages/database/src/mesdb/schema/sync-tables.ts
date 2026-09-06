// 동기화 인프라 테이블. 오프라인 우선 클라이언트를 받아내는 계약 전체가 이 3개 위에 선다.
// 도메인 테이블(작업지시/실적/검사/설비)은 Phase 1 이후에 추가한다.
//
// 프로토콜 전문: docs/specs/mes-sync-protocol.md
import {
  pgTable,
  bigint,
  bigserial,
  integer,
  jsonb,
  index,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { mesDeviceStatusEnum, mesSyncOpEnum, mesSyncOpStatusEnum } from './enums';

/**
 * 조직별 단조증가 시퀀스 할당기
 *
 * 쓰기 트랜잭션 안에서
 *   UPDATE mes_org_sequence SET last_seq = last_seq + $n WHERE organization_id = $org RETURNING last_seq
 * 로 n개를 예약한다. 행 잠금이 커밋까지 유지되므로 뒤에 온 트랜잭션은 앞 트랜잭션이 커밋될 때까지
 * seq 를 못 받는다. 결과적으로 seq 오름차순 = 커밋 순서가 되어, 델타 pull 이 "이미 커서를
 * 지나쳤지만 아직 커밋 안 된 행"을 영구히 건너뛰는 사고가 구조적으로 불가능해진다.
 *
 * bigserial 로는 이 성질이 성립하지 않는다. 시퀀스는 트랜잭션 밖에서 증가하기 때문에
 * 할당 순서와 커밋 순서가 어긋나고, 그 틈에 있던 행은 다시는 pull 에 나타나지 않는다.
 */
export const mesOrgSequence = pgTable('mes_org_sequence', {
  organizationId: integer('organization_id').primaryKey(),
  lastSeq: bigint('last_seq', { mode: 'number' }).notNull().default(0),
});

/**
 * 멱등 쓰기 원장. push 로 들어온 op 1건이 여기 1행이다.
 *
 * 같은 client_op_id 가 다시 오면 도메인 서비스를 호출하지 않고 이 행의 result 를 그대로
 * 되돌려준다. 이 원장이 있어야 응답이 유실된 재전송에서 클라이언트가 outbox 를 확정 삭제할 수
 * 있다. 없으면 재시도가 중복 실적을 만들거나, 반대로 클라이언트가 영원히 확신하지 못한다.
 *
 * request_hash 는 "같은 op id 로 다른 내용"을 보내는 클라이언트 버그를 잡는다(OP_ID_REUSED)
 */
export const mesSyncOperations = pgTable(
  'mes_sync_operations',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    organizationId: integer('organization_id').notNull(),
    clientOpId: uuid('client_op_id').notNull(),
    deviceId: varchar('device_id', { length: 64 }).notNull(),
    entity: varchar('entity', { length: 48 }).notNull(),
    op: mesSyncOpEnum('op').notNull(),
    // sha256(정규화된 payload). 같은 op id 재사용 탐지용
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    status: mesSyncOpStatusEnum('status').notNull(),
    rejectReason: varchar('reject_reason', { length: 48 }),
    targetId: bigint('target_id', { mode: 'number' }),
    resultSeq: bigint('result_seq', { mode: 'number' }),
    // 재전송 시 그대로 반환할 응답 본문
    result: jsonb('result').notNull(),
    // 단말이 주장한 발생 시각. 공장 PC 시계는 못 믿지만 작업자가 실제로 버튼을 누른 시점은
    // 실적 분석에 필요하다. 정렬과 커서에는 절대 쓰지 않는다(그건 server_seq 의 몫)
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    clockSkewMs: integer('clock_skew_ms'),
  },
  (t) => ({
    orgOpUq: unique('mes_sync_operations_org_op_uq').on(t.organizationId, t.clientOpId),
    orgReceivedIdx: index('mes_sync_operations_org_received_idx').on(
      t.organizationId,
      t.receivedAt,
    ),
  }),
);

/**
 * 현장 단말 등록부
 *
 * 단말은 사람과 별개의 주체다. 조직/사이트/라인 범위가 여기 고정되고, 작업자가 로그인하지 않은
 * 새벽에도 설비 상태를 계속 올려야 하므로 사람 세션과 수명이 다르다.
 *
 * token_hash 만 저장한다. 원문 토큰은 발급 응답에 1회만 나가고 서버에 남지 않는다.
 *
 * scope_version 은 allowed_line_ids 가 바뀔 때 증가한다. 커서에 실려 오므로 범위가 바뀐 단말은
 * 스코프 엔티티만 자동 재부트스트랩된다. 이걸 안 올리면 새로 배정된 라인의 과거 데이터가
 * 영원히 안 내려온다(커서가 이미 그 지점을 지나쳐 있다)
 */
export const mesDevices = pgTable(
  'mes_devices',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    organizationId: integer('organization_id').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    siteCode: varchar('site_code', { length: 40 }),
    // 이 단말이 볼 수 있는 라인. 쿼리 파라미터가 아니라 여기서 서버가 강제한다.
    // 파라미터로 두면 탈취된 단말이 공장 전체 데이터를 내려받는다.
    allowedLineIds: jsonb('allowed_line_ids').$type<number[]>().notNull().default([]),
    scopeVersion: integer('scope_version').notNull().default(1),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    status: mesDeviceStatusEnum('status').notNull().default('ACTIVE'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    lastAckedSeq: bigint('last_acked_seq', { mode: 'number' }),
    // 마지막으로 보고한 클라이언트 버전. 현장 fleet 현황 조회에 쓴다.
    lastClientVersion: varchar('last_client_version', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('mes_devices_org_idx').on(t.organizationId),
  }),
);
