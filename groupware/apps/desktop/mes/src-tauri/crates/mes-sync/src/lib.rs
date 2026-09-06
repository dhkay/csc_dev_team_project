//! 동기화 엔진. Phase 0 은 연결 판정(순수 로직)만 담는다.
//!
//! Phase 1 에서 pull(델타)과 push(outbox flush)가 여기 들어온다. 그때도 이 crate 는
//! `mes-app`(Tauri)에 의존하지 않는다. 그래야 Tauri 없이 `cargo test` 로 돌고, 나중에
//! 태블릿 같은 두 번째 클라이언트가 생기면 crate 이동만으로 재사용된다.

pub mod connectivity;
pub mod status;

pub use connectivity::{ConnectivityTracker, Probe};
pub use status::{Connectivity, SyncStatus};
