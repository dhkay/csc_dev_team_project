//! 로컬 스키마 마이그레이션.
//!
//! `PRAGMA user_version` 을 단일 진실원으로 쓴다. 별도 메타 테이블을 두지 않는 이유:
//! 부팅 최초 쿼리 이전에 읽을 수 있어야 한다(테이블이 없을 수도 있는 시점).
//!
//! 다운 마이그레이션은 만들지 않는다. 현장에서 다운그레이드 실행은 데이터 손실 경로다.

use std::path::{Path, PathBuf};

use rusqlite::Connection;

/// 코드가 기대하는 스키마 버전. 마이그레이션을 추가하면 함께 올린다.
pub const CODE_SCHEMA_VERSION: i64 = 1;

/// 순서 있는 마이그레이션. 인덱스 + 1 이 그 마이그레이션 적용 후의 user_version 이다.
///
/// `include_str!` 이라 파일이 사라지면 빌드가 실패한다. 런타임 로딩이면 마이그레이션이
/// 누락된 채로 배포되어 현장에서야 드러난다.
const MIGRATIONS: &[&str] = &[include_str!("../migrations/0001_init.sql")];

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("SQLite 오류: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("백업 실패: {0}")]
    Backup(#[from] std::io::Error),
    #[error("로컬 DB(v{found})가 이 앱(v{expected})보다 최신입니다. 읽기 전용으로 엽니다.")]
    SchemaAhead { found: i64, expected: i64 },
}

/// 열린 저장소의 상태. 진단 화면이 그대로 표시한다.
#[derive(Debug, Clone)]
pub struct StoreInfo {
    pub schema_version: i64,
    pub expected_schema_version: i64,
    /// DB 가 코드보다 최신이라 쓰기를 막은 상태
    pub read_only: bool,
    pub path: Option<String>,
}

/// 연결을 열고 마이그레이션을 적용한다.
///
/// 반환된 `StoreInfo.read_only` 가 true 면 쓰기를 시도하면 안 된다. 앱을 롤백했는데 DB 는
/// 신버전인 경우이고, 그냥 열면 신버전 컬럼의 데이터가 조용히 잘려 나간다. 자동 처리하지 않고
/// 사람에게 알리는 것이 유일하게 안전한 선택이다.
pub fn open_and_migrate(path: &Path) -> Result<(Connection, StoreInfo), StoreError> {
    let conn = Connection::open(path)?;
    configure_pragmas(&conn)?;

    let current = user_version(&conn)?;
    let target = MIGRATIONS.len() as i64;

    if current > target {
        return Ok((
            conn,
            StoreInfo {
                schema_version: current,
                expected_schema_version: target,
                read_only: true,
                path: path.to_str().map(str::to_owned),
            },
        ));
    }

    if current < target {
        // 마이그레이션 직전 백업. 현장은 복구 수단이 없으면 아무것도 못 한다.
        backup_before_migration(path, current)?;
        apply_migrations(&conn, current, target)?;
    }

    Ok((
        conn,
        StoreInfo {
            schema_version: target,
            expected_schema_version: target,
            read_only: false,
            path: path.to_str().map(str::to_owned),
        },
    ))
}

fn configure_pragmas(conn: &Connection) -> Result<(), rusqlite::Error> {
    // synchronous=FULL 인 이유: 공장은 정전이 실제로 일어난다. NORMAL 은 파일 손상은 없어도
    // 최근 트랜잭션을 잃을 수 있는데, 잃는 것이 실적 한 건이면 그 손실이 성능 이득보다 크다.
    // 쓰기가 분당 몇 건 수준이라 비용도 사실상 없다.
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = FULL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )
}

fn user_version(conn: &Connection) -> Result<i64, rusqlite::Error> {
    conn.pragma_query_value(None, "user_version", |row| row.get(0))
}

fn apply_migrations(conn: &Connection, from: i64, to: i64) -> Result<(), rusqlite::Error> {
    for index in from..to {
        let sql = MIGRATIONS[index as usize];
        // 마이그레이션 본문과 버전 갱신을 한 트랜잭션에 묶는다. 중간에 죽으면 통째로
        // 롤백되어 다음 기동이 같은 지점에서 다시 시작한다.
        conn.execute_batch("BEGIN")?;
        match conn
            .execute_batch(sql)
            .and_then(|_| conn.pragma_update(None, "user_version", index + 1))
        {
            Ok(()) => {
                conn.execute_batch("COMMIT")?;
            }
            Err(error) => {
                let _ = conn.execute_batch("ROLLBACK");
                return Err(error);
            }
        }
    }
    Ok(())
}

/// 마이그레이션 직전 파일 백업. 최근 3개만 남긴다.
fn backup_before_migration(path: &Path, from_version: i64) -> Result<(), std::io::Error> {
    if !path.exists() || from_version == 0 {
        // 새로 만드는 DB 는 백업할 것이 없다.
        return Ok(());
    }
    let backup = backup_path(path, from_version);
    std::fs::copy(path, &backup)?;
    prune_backups(path, 3);
    Ok(())
}

fn backup_path(path: &Path, from_version: i64) -> PathBuf {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("mes.db");
    path.with_file_name(format!("{name}.bak-v{from_version}"))
}

/// 오래된 백업 정리. 실패해도 조용히 넘긴다(백업 정리 실패로 기동을 막을 이유가 없다).
fn prune_backups(path: &Path, keep: usize) {
    let Some(dir) = path.parent() else { return };
    let Some(stem) = path.file_name().and_then(|n| n.to_str()) else {
        return;
    };
    let prefix = format!("{stem}.bak-v");
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut backups: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with(&prefix))
        })
        .collect();
    backups.sort();
    if backups.len() > keep {
        for old in &backups[..backups.len() - keep] {
            let _ = std::fs::remove_file(old);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 빈 DB 를 0 에서 최신까지 올린다.
    #[test]
    fn migrates_from_zero_to_head() {
        let dir = std::env::temp_dir().join(format!("mes-store-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("fresh.db");
        let _ = std::fs::remove_file(&path);

        let (conn, info) = open_and_migrate(&path).unwrap();
        assert_eq!(info.schema_version, CODE_SCHEMA_VERSION);
        assert!(!info.read_only);

        // outbox 테이블이 실제로 생겼는지. 마이그레이션이 "돌았다" 와 "적용됐다" 는 다르다.
        let count: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='outbox'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        let _ = std::fs::remove_file(&path);
    }

    /// 재실행해도 같은 결과다(멱등).
    #[test]
    fn migration_is_idempotent() {
        let dir = std::env::temp_dir().join(format!("mes-store-idem-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("idem.db");
        let _ = std::fs::remove_file(&path);

        let (_, first) = open_and_migrate(&path).unwrap();
        let (_, second) = open_and_migrate(&path).unwrap();
        assert_eq!(first.schema_version, second.schema_version);
        assert!(!second.read_only);

        let _ = std::fs::remove_file(&path);
    }

    /// DB 가 코드보다 최신이면 읽기 전용으로 연다.
    /// 앱 롤백 시 신버전 컬럼의 데이터가 조용히 잘려 나가는 것을 막는다.
    #[test]
    fn schema_ahead_opens_read_only() {
        let dir = std::env::temp_dir().join(format!("mes-store-ahead-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("ahead.db");
        let _ = std::fs::remove_file(&path);

        {
            let conn = Connection::open(&path).unwrap();
            conn.pragma_update(None, "user_version", CODE_SCHEMA_VERSION + 5)
                .unwrap();
        }

        let (_, info) = open_and_migrate(&path).unwrap();
        assert!(info.read_only);
        assert_eq!(info.schema_version, CODE_SCHEMA_VERSION + 5);

        let _ = std::fs::remove_file(&path);
    }
}
