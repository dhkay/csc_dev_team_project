//! 로컬 SQLite 저장소. Rust 가 DB 를 소유한다.
//!
//! JS 에서 SQL 을 실행하지 않는 이유 셋:
//!   1. 단일 writer 라 `SQLITE_BUSY` 경합이 원천 소멸한다.
//!   2. outbox flush 가 WebView 재로드와 라우트 이동을 넘어 살아남는다.
//!   3. 저사양 PC 에서는 화면당 굵은 명령 한 번이 잦은 SQL 왕복보다 싸다.
//!
//! rusqlite 는 이 crate 밖으로 새지 않는다. 위쪽(`mes-app`)은 `Store` 만 안다.

pub mod migrate;
pub mod store;

pub use migrate::{open_and_migrate, StoreError, StoreInfo, CODE_SCHEMA_VERSION};
pub use store::{LocalStoreInfo, OutboxFailure, OutboxSummary, Store};
