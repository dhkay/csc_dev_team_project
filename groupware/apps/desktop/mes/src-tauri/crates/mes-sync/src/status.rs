//! WebView 로 방송하는 동기화 상태.
//!
//! 필드 이름은 TS 의 `SyncStatus`(infrastructure/sync/syncPort.ts)와 같아야 한다.
//! 갈리면 상태바가 조용히 0 을 표시하고, 그게 곧 "미전송이 없다" 는 거짓 신호가 된다.

use serde::{Deserialize, Serialize};

/// 연결 상태.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Connectivity {
    Online,
    /// 응답은 오지만 느림. 화면이 "동기화 지연"으로 구분해 보여준다
    Degraded,
    Offline,
    /// 아직 판정 전(앱 기동 직후)
    Unknown,
}

/// 상태바와 진단 화면이 읽는 값.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub connectivity: Connectivity,
    pub last_pull_at: Option<String>,
    pub last_push_at: Option<String>,
    pub pending_count: u32,
    pub failed_count: u32,
    pub conflict_count: u32,
}

impl Default for SyncStatus {
    fn default() -> Self {
        Self {
            connectivity: Connectivity::Unknown,
            last_pull_at: None,
            last_push_at: None,
            pending_count: 0,
            failed_count: 0,
            conflict_count: 0,
        }
    }
}
