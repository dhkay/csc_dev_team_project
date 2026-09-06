//! 도메인 코어. IO 를 모른다(파일, 네트워크, DB, Tauri 없음).
//!
//! 이 규칙을 지켜야 테스트가 밀리초 단위로 돌고, 그래야 실제로 테스트를 짜게 된다.
//! Rust 선례가 0건인 팀에서 첫 crate 가 무겁게 시작하면 그 뒤로 아무도 안 건드린다.

pub mod outbox;
pub mod version;

pub use outbox::{OutboxStatus, OutboxTransition, TransitionError};
pub use version::{compare_versions, parse_version, ClientStatus, Version};
