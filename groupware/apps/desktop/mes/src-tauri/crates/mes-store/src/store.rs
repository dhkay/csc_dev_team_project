//! 저장소 파사드.
//!
//! rusqlite 는 이 crate 밖으로 새지 않는다. `mes-app`(Tauri)은 `Store` 의 메서드만
//! 알고 SQL 도 커넥션도 모른다. 이 경계가 있어야 나중에 저장소를 바꾸거나 두 번째
//! 클라이언트를 붙일 때 위쪽 코드가 흔들리지 않는다.
//!
//! 커넥션은 하나이고 Mutex 로 감싼다. 단일 writer 라 `SQLITE_BUSY` 경합이 원천 소멸한다.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::migrate::{open_and_migrate, StoreError, StoreInfo};

/// 진단 화면이 읽는 로컬 DB 메타. 필드명은 TS 의 `LocalStoreInfo` 와 같아야 한다.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalStoreInfo {
    pub schema_version: i64,
    pub expected_schema_version: i64,
    pub read_only: bool,
    pub path: Option<String>,
}

impl From<&StoreInfo> for LocalStoreInfo {
    fn from(info: &StoreInfo) -> Self {
        Self {
            schema_version: info.schema_version,
            expected_schema_version: info.expected_schema_version,
            read_only: info.read_only,
            path: info.path.clone(),
        }
    }
}

/// outbox 요약. 필드명은 TS 의 `OutboxSummary` 와 같아야 한다.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutboxSummary {
    pub pending: u32,
    pub sending: u32,
    pub failed: u32,
    pub conflict: u32,
    pub dead: u32,
    pub oldest_pending_at: Option<String>,
}

/// 최근 실패 1건. 필드명은 TS 의 `OutboxFailure` 와 같아야 한다.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutboxFailure {
    pub client_op_id: String,
    pub entity: String,
    pub status: String,
    pub attempt_count: u32,
    pub last_error_code: Option<String>,
    pub last_error_message: Option<String>,
    pub updated_at: String,
}

/// 로컬 저장소.
pub struct Store {
    conn: Mutex<Connection>,
    info: StoreInfo,
}

impl Store {
    /// DB 를 열고 마이그레이션을 적용한다.
    pub fn open(path: &Path) -> Result<Self, StoreError> {
        let (conn, info) = open_and_migrate(path)?;
        Ok(Self {
            conn: Mutex::new(conn),
            info,
        })
    }

    pub fn info(&self) -> LocalStoreInfo {
        LocalStoreInfo::from(&self.info)
    }

    /// 쓰기가 금지된 상태인지. DB 가 코드보다 최신일 때 true.
    pub fn is_read_only(&self) -> bool {
        self.info.read_only
    }

    /// outbox 상태별 건수와 가장 오래된 미전송 시각.
    pub fn outbox_summary(&self) -> Result<OutboxSummary, StoreError> {
        let conn = self.lock();
        let mut summary = OutboxSummary::default();

        let mut stmt = conn.prepare("SELECT status, count(*) FROM outbox GROUP BY status")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        for row in rows {
            let (status, count) = row?;
            let count = count.max(0) as u32;
            match status.as_str() {
                "pending" => summary.pending = count,
                "sending" => summary.sending = count,
                "failed" => summary.failed = count,
                "conflict" => summary.conflict = count,
                "dead" => summary.dead = count,
                // acked 는 요약에 세지 않는다. 화면이 알아야 하는 건 "아직 안 간 것" 이다.
                _ => {}
            }
        }

        summary.oldest_pending_at = conn
            .query_row(
                "SELECT min(created_at) FROM outbox WHERE status = 'pending'",
                [],
                |row| row.get::<_, Option<String>>(0),
            )
            .unwrap_or(None);

        Ok(summary)
    }

    /// 최근 실패 항목. 진단 화면이 5건 정도 보여준다.
    pub fn recent_failures(&self, limit: u32) -> Result<Vec<OutboxFailure>, StoreError> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT client_op_id, entity, status, attempt_count, last_error_code,
                    last_error_message, updated_at
             FROM outbox
             WHERE status IN ('failed', 'conflict', 'dead')
             ORDER BY updated_at DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], |row| {
            Ok(OutboxFailure {
                client_op_id: row.get(0)?,
                entity: row.get(1)?,
                status: row.get(2)?,
                attempt_count: row.get::<_, i64>(3)?.max(0) as u32,
                last_error_code: row.get(4)?,
                last_error_message: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// Mutex 가 poison 되어도 계속 진행한다.
    ///
    /// 다른 스레드가 패닉했다고 현장 단말이 통째로 멈추면 안 된다. 최악의 경우 그 한 번의
    /// 쓰기가 실패했을 뿐이고, 트랜잭션 경계가 데이터 정합성을 이미 지켜준다.
    fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store(tag: &str) -> (Store, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("mes-store-{tag}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("store.db");
        let _ = std::fs::remove_file(&path);
        let store = Store::open(&path).unwrap();
        (store, path)
    }

    /// 새 DB 는 미전송이 0 이고 쓰기가 허용된다.
    #[test]
    fn fresh_store_is_empty_and_writable() {
        let (store, path) = temp_store("empty");
        assert!(!store.is_read_only());
        let summary = store.outbox_summary().unwrap();
        assert_eq!(summary.pending, 0);
        assert_eq!(summary.oldest_pending_at, None);
        assert!(store.recent_failures(5).unwrap().is_empty());
        let _ = std::fs::remove_file(&path);
    }

    /// 요약이 상태별로 집계되고 acked 는 세지 않는다.
    /// 화면이 알아야 하는 건 "아직 안 간 것" 이다.
    #[test]
    fn summary_counts_unsent_only() {
        let (store, path) = temp_store("counts");
        {
            let conn = store.lock();
            for (id, status) in [
                ("a", "pending"),
                ("b", "pending"),
                ("c", "failed"),
                ("d", "acked"),
            ] {
                conn.execute(
                    "INSERT INTO outbox (client_op_id, client_seq, entity, op, occurred_at,
                        payload_json, status, next_attempt_at, created_at, updated_at)
                     VALUES (?1, 1, 'production_record', 'CREATE', '2026-08-10T00:00:00Z',
                        '{}', ?2, '2026-08-10T00:00:00Z', '2026-08-10T00:00:00Z',
                        '2026-08-10T00:00:00Z')",
                    rusqlite::params![id, status],
                )
                .unwrap();
            }
        }
        let summary = store.outbox_summary().unwrap();
        assert_eq!(summary.pending, 2);
        assert_eq!(summary.failed, 1);
        assert!(summary.oldest_pending_at.is_some());
        let _ = std::fs::remove_file(&path);
    }
}
