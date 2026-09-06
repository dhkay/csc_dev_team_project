//! outbox 상태 머신.
//!
//! ```text
//! pending  --(워커가 집음, lease 설정)-->  sending
//! sending  --2xx 또는 같은 키 재전송 응답-->  acked
//! sending  --네트워크 오류 / 5xx / 429-->    pending  (attempt+1)
//! sending  --409 의미적 충돌-->              conflict (사람이 판단)
//! sending  --400/403/422-->                  failed   (사람이 판단)
//! pending  --attempt > MAX-->                dead     (사람이 판단)
//! ```
//!
//! 설계 원칙 하나: 조용히 버리지 않는다. 어떤 경로로도 행이 사라지지 않고, 사람이
//! 판단해야 하는 상태(failed / conflict / dead)로만 빠진다. 현장에서 사라진 실적은
//! 되찾을 방법이 없기 때문이다.

use serde::{Deserialize, Serialize};

/// 재시도 상한. 넘으면 dead 로 격리하고 사람에게 알린다(삭제하지 않는다).
pub const MAX_ATTEMPTS: u32 = 20;

/// outbox 한 건의 상태.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OutboxStatus {
    Pending,
    Sending,
    Acked,
    Failed,
    Conflict,
    Dead,
}

impl OutboxStatus {
    /// 사람이 손대야 하는 상태인지. 진단 화면의 "확인 필요" 카운터가 이걸 센다.
    pub fn needs_attention(self) -> bool {
        matches!(
            self,
            OutboxStatus::Failed | OutboxStatus::Conflict | OutboxStatus::Dead
        )
    }

    /// 아직 서버에 안 간 상태인지(사람 개입 대기 포함).
    pub fn is_unsent(self) -> bool {
        !matches!(self, OutboxStatus::Acked)
    }

    /// 최종 상태인지. 워커가 더 이상 집지 않는다.
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            OutboxStatus::Acked
                | OutboxStatus::Failed
                | OutboxStatus::Conflict
                | OutboxStatus::Dead
        )
    }
}

/// 상태를 옮기는 사건.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutboxTransition {
    /// 워커가 집었다(lease 설정)
    Claimed,
    /// 서버가 적용했거나 중복으로 흡수했다
    Acknowledged,
    /// 일시적 실패(네트워크, 5xx, 429). 재시도 대상
    RetryableError,
    /// 영구 실패(400/403/422). 사람이 판단
    PermanentError,
    /// 의미적 충돌(409). 사람이 판단
    Conflicted,
    /// lease 만료. 워커가 죽어 sending 에 남은 행을 되살린다
    LeaseExpired,
}

/// 허용되지 않는 전이. 조용히 무시하지 않고 오류로 만든다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransitionError {
    pub from: OutboxStatus,
    pub transition: OutboxTransition,
}

impl std::fmt::Display for TransitionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "허용되지 않는 전이: {:?} + {:?}",
            self.from, self.transition
        )
    }
}

impl std::error::Error for TransitionError {}

/// 다음 상태를 계산한다. `attempt_count` 는 이 사건을 반영하기 전 값이다.
pub fn next_status(
    from: OutboxStatus,
    transition: OutboxTransition,
    attempt_count: u32,
) -> Result<OutboxStatus, TransitionError> {
    use OutboxStatus::*;
    use OutboxTransition::*;

    let next = match (from, transition) {
        (Pending, Claimed) => Sending,
        (Sending, Acknowledged) => Acked,
        (Sending, RetryableError) => {
            // 상한을 넘으면 격리한다. 무한 재시도는 서버를 두드리면서 실패도 감춘다.
            if attempt_count + 1 >= MAX_ATTEMPTS {
                Dead
            } else {
                Pending
            }
        }
        (Sending, PermanentError) => Failed,
        (Sending, Conflicted) => Conflict,
        // 기동 시 복구: 워커가 죽어 sending 에 남은 행을 되살린다.
        // 멱등키(client_op_id)가 있으므로 재전송이 안전하다.
        (Sending, LeaseExpired) => Pending,
        // 충돌이나 실패를 사람이 처리한 뒤 다시 큐에 넣는 경로.
        (Conflict, Claimed) | (Failed, Claimed) | (Dead, Claimed) => Sending,
        _ => return Err(TransitionError { from, transition }),
    };
    Ok(next)
}

/// 재시도 대기 시간(밀리초). 지수 백오프에 상한을 둔다.
///
/// jitter 는 여기서 더하지 않는다(순수 함수 유지). 호출부가 더한다.
pub fn backoff_ms(attempt_count: u32) -> u64 {
    const BASE_MS: u64 = 2_000;
    const CAP_MS: u64 = 300_000; // 5분
    let shift = attempt_count.min(20);
    BASE_MS.saturating_mul(1u64 << shift).min(CAP_MS)
}

// 테스트 이름은 ASCII 로 둔다. Rust 는 비ASCII 식별자를 허용하지만 CI 가
// `clippy -D warnings` 로 도는 상황에서 스크립트 관련 lint 를 자극할 이유가 없다.
// 의도는 각 테스트 위 주석에 한국어로 적는다.
#[cfg(test)]
mod tests {
    use super::*;

    /// 정상 경로: pending 에서 acked 까지.
    #[test]
    fn happy_path_reaches_acked() {
        let s = next_status(OutboxStatus::Pending, OutboxTransition::Claimed, 0).unwrap();
        assert_eq!(s, OutboxStatus::Sending);
        let s = next_status(s, OutboxTransition::Acknowledged, 0).unwrap();
        assert_eq!(s, OutboxStatus::Acked);
        assert!(s.is_terminal());
        assert!(!s.is_unsent());
    }

    /// 재시도 가능한 실패는 pending 으로 돌아온다.
    #[test]
    fn retryable_error_returns_to_pending() {
        let s = next_status(OutboxStatus::Sending, OutboxTransition::RetryableError, 0).unwrap();
        assert_eq!(s, OutboxStatus::Pending);
    }

    /// 재시도 상한을 넘으면 격리한다. 삭제가 아니라 dead 다.
    /// 조용히 버리지 않는 것이 이 설계의 핵심이다.
    #[test]
    fn exceeding_max_attempts_moves_to_dead() {
        let s = next_status(
            OutboxStatus::Sending,
            OutboxTransition::RetryableError,
            MAX_ATTEMPTS - 1,
        )
        .unwrap();
        assert_eq!(s, OutboxStatus::Dead);
        assert!(s.needs_attention());
        assert!(s.is_unsent());
    }

    /// lease 만료는 pending 으로 되살린다. 워커가 죽어 sending 에 남은 행이며,
    /// 멱등키가 있어 재전송이 안전하다.
    #[test]
    fn expired_lease_revives_to_pending() {
        let s = next_status(OutboxStatus::Sending, OutboxTransition::LeaseExpired, 3).unwrap();
        assert_eq!(s, OutboxStatus::Pending);
    }

    /// 영구 실패와 충돌은 사람 판단 상태로 간다. 둘 다 아직 서버에 안 갔으므로
    /// 미전송 카운터에 잡혀야 방치되지 않는다.
    #[test]
    fn permanent_error_and_conflict_need_attention() {
        let failed =
            next_status(OutboxStatus::Sending, OutboxTransition::PermanentError, 0).unwrap();
        let conflict = next_status(OutboxStatus::Sending, OutboxTransition::Conflicted, 0).unwrap();
        assert!(failed.needs_attention());
        assert!(conflict.needs_attention());
        assert!(failed.is_unsent());
        assert!(conflict.is_unsent());
    }

    /// 이미 서버가 받은 건을 되돌리는 경로는 없다.
    #[test]
    fn acked_rejects_any_transition() {
        let err = next_status(OutboxStatus::Acked, OutboxTransition::Claimed, 0);
        assert!(err.is_err());
    }

    /// 백오프는 상한을 넘지 않는다.
    #[test]
    fn backoff_is_capped() {
        assert_eq!(backoff_ms(0), 2_000);
        assert_eq!(backoff_ms(1), 4_000);
        assert!(backoff_ms(50) <= 300_000);
    }
}
