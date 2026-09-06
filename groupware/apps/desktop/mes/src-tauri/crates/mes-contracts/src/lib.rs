//! MES 계약의 Rust 미러.
//!
//! SSOT 는 TypeScript(`packages/mes-contracts`)이고 여기는 미러다.
//! 한쪽에만 있는 필드는 오류 없이 조용히 유실된다. 보낸 줄 알았는데 서버에 값이 안 남는
//! 형태로 망가지므로, `scripts/check-mes-contracts.mjs` 가 enum 값 집합과 봉투 필드 집합의
//! 일치를 CI 에서 강제한다.
//!
//! 그 검사 스크립트가 이 파일을 파싱한다. 다음 두 규칙을 지켜야 한다.
//!   1. enum 의 모든 variant 에 `#[serde(rename = "...")]` 을 명시한다(값을 문자열로 추출).
//!   2. `MutationEnvelope` 필드는 snake_case 로 적고 구조체에 `rename_all = "camelCase"` 를 건다.

use serde::{Deserialize, Serialize};

/// 전송 계약 버전. TS 의 `WIRE_VERSION` 과 같아야 한다.
pub const WIRE_VERSION: u32 = 1;

/// 절대 불변식: 동기화 push 는 어떤 클라이언트 버전 판정 상태에서도 수락된다.
///
/// 구버전 PC 를 차단해 놓고 그 PC 의 outbox 에 어제 생산실적이 남아 있으면 영구 유실이다.
pub const SYNC_PUSH_ALWAYS_ACCEPTED: bool = true;

/// 요청 전체가 실패했을 때의 오류 코드.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MesErrorCode {
    #[serde(rename = "TOKEN_EXPIRED")]
    TokenExpired,
    #[serde(rename = "DEVICE_REVOKED")]
    DeviceRevoked,
    #[serde(rename = "FEATURE_NOT_GRANTED")]
    FeatureNotGranted,
    #[serde(rename = "CURSOR_VERSION_MISMATCH")]
    CursorVersionMismatch,
    #[serde(rename = "CURSOR_TOO_OLD")]
    CursorTooOld,
    #[serde(rename = "MAX_BATCH_EXCEEDED")]
    MaxBatchExceeded,
    #[serde(rename = "RATE_LIMITED")]
    RateLimited,
    #[serde(rename = "CLIENT_UPGRADE_REQUIRED")]
    ClientUpgradeRequired,
    #[serde(rename = "INTERNAL_ERROR")]
    InternalError,
}

/// op 1건의 거부 사유.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RejectReason {
    #[serde(rename = "VALIDATION_FAILED")]
    ValidationFailed,
    #[serde(rename = "ENTITY_NOT_FOUND")]
    EntityNotFound,
    #[serde(rename = "STALE_MASTER")]
    StaleMaster,
    #[serde(rename = "VERSION_CONFLICT")]
    VersionConflict,
    #[serde(rename = "INVALID_TRANSITION")]
    InvalidTransition,
    #[serde(rename = "DUPLICATE_NATURAL_KEY")]
    DuplicateNaturalKey,
    #[serde(rename = "QTY_EXCEEDS_PLAN")]
    QtyExceedsPlan,
    #[serde(rename = "FORBIDDEN_SCOPE")]
    ForbiddenScope,
    #[serde(rename = "OP_ID_REUSED")]
    OpIdReused,
    #[serde(rename = "REQUIRES_ELEVATION")]
    RequiresElevation,
    #[serde(rename = "TEMPORARILY_UNAVAILABLE")]
    TemporarilyUnavailable,
}

impl RejectReason {
    /// 로컬 판정용 기본값.
    ///
    /// 서버 응답의 `retryable` 이 항상 우선한다. 이 표는 응답에 값이 없을 때만 쓴다.
    /// 클라이언트가 분류를 진실원으로 삼으면 서버가 정책을 바꿀 때 전 단말 재배포가 필요해진다.
    pub fn default_retryable(self) -> bool {
        matches!(
            self,
            RejectReason::EntityNotFound
                | RejectReason::StaleMaster
                | RejectReason::VersionConflict
                | RejectReason::TemporarilyUnavailable
        )
    }
}

/// 쓰기 종류.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MutationOp {
    #[serde(rename = "CREATE")]
    Create,
    #[serde(rename = "UPDATE")]
    Update,
    #[serde(rename = "DELETE")]
    Delete,
    #[serde(rename = "INTENT")]
    Intent,
}

/// op 처리 결과.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SyncOpStatus {
    #[serde(rename = "APPLIED")]
    Applied,
    #[serde(rename = "DUPLICATE")]
    Duplicate,
    #[serde(rename = "REJECTED")]
    Rejected,
}

/// 동기화 엔티티 어휘.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SyncEntity {
    #[serde(rename = "item")]
    Item,
    #[serde(rename = "line")]
    Line,
    #[serde(rename = "process")]
    Process,
    #[serde(rename = "worker")]
    Worker,
    #[serde(rename = "equipment")]
    Equipment,
    #[serde(rename = "defect_code")]
    DefectCode,
    #[serde(rename = "downtime_reason")]
    DowntimeReason,
    #[serde(rename = "inspection_template")]
    InspectionTemplate,
    #[serde(rename = "work_order")]
    WorkOrder,
    #[serde(rename = "production_record")]
    ProductionRecord,
    #[serde(rename = "inspection")]
    Inspection,
    #[serde(rename = "equipment_state_event")]
    EquipmentStateEvent,
    #[serde(rename = "_log")]
    Log,
    #[serde(rename = "label_print")]
    LabelPrint,
}

/// outbox 한 건. 전송 시 그대로 직렬화된다.
///
/// `client_op_id` 는 작업자가 확인 버튼을 누른 순간 생성한다(전송 시점이 아니다).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationEnvelope {
    pub client_op_id: String,
    pub client_seq: i64,
    pub entity: SyncEntity,
    pub op: MutationOp,
    pub target_id: Option<i64>,
    pub base_version: Option<i64>,
    pub intent: Option<String>,
    pub worker_id: Option<i64>,
    pub occurred_at: String,
    pub payload: serde_json::Value,
}

/// push 요청 본문.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushRequest {
    pub device_id: String,
    pub client_time: String,
    pub operations: Vec<MutationEnvelope>,
}

/// op 1건의 처리 결과.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOpResult {
    pub client_op_id: String,
    pub status: SyncOpStatus,
    pub entity: SyncEntity,
    pub server_id: Option<i64>,
    pub server_seq: Option<i64>,
    pub version: Option<i64>,
    pub reason: Option<RejectReason>,
    pub retryable: bool,
    pub message: Option<String>,
    pub details: Option<serde_json::Value>,
}

/// push 응답. HTTP 상태는 항상 200 이고 op별 성패는 `results` 로 전달된다.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushResponse {
    pub server_time: String,
    pub clock_skew_ms: i64,
    pub cursor_hint: Option<String>,
    pub results: Vec<SyncOpResult>,
}

/// pull 변경 1건.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncChange {
    pub entity: SyncEntity,
    pub op: String,
    pub seq: i64,
    pub id: i64,
    pub version: Option<i64>,
    pub data: Option<serde_json::Value>,
    pub deleted_at: Option<String>,
}

/// pull 응답.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullResponse {
    pub cursor: String,
    pub has_more: bool,
    pub server_time: String,
    pub bootstrap: bool,
    pub window_from: Option<String>,
    pub changes: Vec<SyncChange>,
}

/// 배치 한도. 서버 manifest 가 우선이며 이 값은 초기값이다.
pub const MAX_OPERATIONS_PER_BATCH: usize = 200;
pub const MAX_PUSH_BODY_BYTES: usize = 1_048_576;
pub const DEFAULT_PULL_LIMIT: u32 = 500;
pub const MAX_PULL_LIMIT: u32 = 2000;

/// 클라이언트 신원 헤더.
pub const CLIENT_APP_HEADER: &str = "x-client-app";
pub const CLIENT_VERSION_HEADER: &str = "x-client-version";
pub const DEVICE_ID_HEADER: &str = "x-device-id";
pub const LOCAL_SCHEMA_HEADER: &str = "x-local-schema";
pub const DEVICE_TOKEN_HEADER: &str = "x-device-token";
pub const MES_DESKTOP_APP_ID: &str = "mes-desktop";
