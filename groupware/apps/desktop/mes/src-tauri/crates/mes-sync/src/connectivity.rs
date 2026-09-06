//! 연결 판정.
//!
//! `navigator.onLine` 을 쓰지 않는다. 공장 네트워크는 링크가 살아 있고 게이트웨이만 죽는
//! 상황이 흔해 거짓 양성이 나온다. 그래서 서버 `/health` 를 능동 프로브한다.
//!
//! 히스테리시스를 둔다. 연속 2회 실패에서 offline, 1회 성공에서 online.
//! 비대칭인 이유: 한 번 튄 패킷으로 화면이 "오프라인" 이 되면 작업자가 불안해하며 입력을
//! 멈춘다. 반대로 복구는 즉시 알려야 밀린 실적이 빨리 나간다.

use crate::status::Connectivity;

/// 프로브 1회 결과.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Probe {
    /// 응답 성공. 왕복 지연(ms)
    Ok(u64),
    /// 도달 실패(타임아웃, 연결 거부, 5xx)
    Failed,
}

/// 응답이 이 시간을 넘으면 degraded 로 본다.
pub const DEGRADED_THRESHOLD_MS: u64 = 2_000;

/// offline 으로 내려가기까지 필요한 연속 실패 횟수.
pub const OFFLINE_AFTER_FAILURES: u32 = 2;

/// 프로브 결과를 누적해 연결 상태를 판정한다.
#[derive(Debug, Clone)]
pub struct ConnectivityTracker {
    state: Connectivity,
    consecutive_failures: u32,
}

impl Default for ConnectivityTracker {
    fn default() -> Self {
        Self::new()
    }
}

impl ConnectivityTracker {
    pub fn new() -> Self {
        Self {
            state: Connectivity::Unknown,
            consecutive_failures: 0,
        }
    }

    pub fn state(&self) -> Connectivity {
        self.state
    }

    pub fn consecutive_failures(&self) -> u32 {
        self.consecutive_failures
    }

    /// 프로브 결과를 반영하고 갱신된 상태를 돌려준다.
    pub fn observe(&mut self, probe: Probe) -> Connectivity {
        match probe {
            Probe::Ok(latency_ms) => {
                self.consecutive_failures = 0;
                self.state = if latency_ms > DEGRADED_THRESHOLD_MS {
                    Connectivity::Degraded
                } else {
                    Connectivity::Online
                };
            }
            Probe::Failed => {
                self.consecutive_failures = self.consecutive_failures.saturating_add(1);
                if self.consecutive_failures >= OFFLINE_AFTER_FAILURES {
                    self.state = Connectivity::Offline;
                }
                // 1회 실패는 상태를 바꾸지 않는다. 한 번 튄 패킷으로 화면이 오프라인이
                // 되면 작업자가 입력을 멈춘다.
            }
        }
        self.state
    }

    /// 오프라인에서 온라인으로 막 올라온 시점인지.
    ///
    /// 이때 대기 중인 outbox 의 `next_attempt_at` 을 즉시로 당기되 `attempt_count` 는
    /// 보존한다. 그래야 진짜로 깨진 행 하나가 복구 순간에 서버를 두드리지 않는다.
    pub fn just_recovered(previous: Connectivity, current: Connectivity) -> bool {
        matches!(previous, Connectivity::Offline)
            && matches!(current, Connectivity::Online | Connectivity::Degraded)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 1회 성공이면 즉시 온라인이다. 복구는 빨리 알려야 밀린 실적이 나간다.
    #[test]
    fn single_success_goes_online() {
        let mut tracker = ConnectivityTracker::new();
        assert_eq!(tracker.observe(Probe::Ok(50)), Connectivity::Online);
    }

    /// 1회 실패로는 오프라인이 되지 않는다.
    #[test]
    fn single_failure_does_not_go_offline() {
        let mut tracker = ConnectivityTracker::new();
        tracker.observe(Probe::Ok(50));
        assert_eq!(tracker.observe(Probe::Failed), Connectivity::Online);
    }

    /// 연속 2회 실패에서 오프라인이 된다.
    #[test]
    fn two_failures_go_offline() {
        let mut tracker = ConnectivityTracker::new();
        tracker.observe(Probe::Ok(50));
        tracker.observe(Probe::Failed);
        assert_eq!(tracker.observe(Probe::Failed), Connectivity::Offline);
    }

    /// 성공하면 실패 카운터가 초기화된다. 간헐적 실패가 누적되어 오프라인이 되면 안 된다.
    #[test]
    fn success_resets_failure_streak() {
        let mut tracker = ConnectivityTracker::new();
        tracker.observe(Probe::Failed);
        tracker.observe(Probe::Ok(50));
        assert_eq!(tracker.consecutive_failures(), 0);
        assert_eq!(tracker.observe(Probe::Failed), Connectivity::Online);
    }

    /// 느린 응답은 degraded 다. 오프라인과 구분해야 화면이 "지연" 을 보여줄 수 있다.
    #[test]
    fn slow_response_is_degraded() {
        let mut tracker = ConnectivityTracker::new();
        assert_eq!(
            tracker.observe(Probe::Ok(DEGRADED_THRESHOLD_MS + 1)),
            Connectivity::Degraded
        );
    }

    /// 복구 시점을 감지한다. outbox 를 즉시 재시도로 당기는 트리거다.
    #[test]
    fn detects_recovery_edge() {
        assert!(ConnectivityTracker::just_recovered(
            Connectivity::Offline,
            Connectivity::Online
        ));
        assert!(!ConnectivityTracker::just_recovered(
            Connectivity::Online,
            Connectivity::Online
        ));
    }
}
