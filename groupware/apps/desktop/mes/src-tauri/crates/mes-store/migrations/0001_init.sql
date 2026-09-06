-- 로컬 SQLite 초기 스키마 (Phase 0).
--
-- 도메인 캐시 테이블(작업지시/품목/설비 등)은 Phase 1 에서 추가한다. 여기에는 어떤 Phase 에도
-- 필요한 뼈대만 둔다: 메타, 동기화 커서, outbox.
--
-- outbox 의 payload 를 구조화 컬럼이 아니라 **JSON TEXT 한 칸**으로 두는 것이 중요하다.
-- 도메인 스키마가 바뀌어도 미전송 outbox 를 마이그레이션할 필요가 없다. 앱 업데이트 때문에
-- 어제 실적이 사라지는 일을 구조적으로 막는다.

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- 엔티티별 마지막 수신 커서. 단일 스칼라가 아니라 엔티티별인 이유는 프로토콜 문서 참고.
CREATE TABLE IF NOT EXISTS sync_state (
  entity          TEXT PRIMARY KEY,
  cursor          TEXT,
  last_pulled_at  TEXT,
  last_full_at    TEXT
);

CREATE TABLE IF NOT EXISTS outbox (
  client_op_id      TEXT PRIMARY KEY,
  client_seq        INTEGER NOT NULL,
  entity            TEXT    NOT NULL,
  op                TEXT    NOT NULL,
  target_id         INTEGER,
  base_version      INTEGER,
  intent            TEXT,
  worker_id         INTEGER,
  occurred_at       TEXT    NOT NULL,
  payload_json      TEXT    NOT NULL,
  -- 선행 op. 드문 교차 의존만 표현한다(전역 FIFO 는 실패한 한 행이 뒤를 전부 막는다).
  depends_on        TEXT,
  status            TEXT    NOT NULL DEFAULT 'pending',
  attempt_count     INTEGER NOT NULL DEFAULT 0,
  next_attempt_at   TEXT    NOT NULL,
  lease_expires_at  TEXT,
  http_status       INTEGER,
  last_error_code   TEXT,
  last_error_message TEXT,
  server_id         INTEGER,
  server_seq        INTEGER,
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL,
  acked_at          TEXT
);

-- 워커가 집을 행을 고르는 유일한 경로.
CREATE INDEX IF NOT EXISTS outbox_ready_idx ON outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS outbox_entity_idx ON outbox (entity, status);

-- 폐기 이력. 사람이 outbox 행을 버리면 사유와 함께 여기 남는다(감사 대상).
CREATE TABLE IF NOT EXISTS sync_audit (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  client_op_id      TEXT NOT NULL,
  action            TEXT NOT NULL,
  reason            TEXT,
  actor_worker_id   INTEGER,
  created_at        TEXT NOT NULL,
  snapshot_json     TEXT
);
