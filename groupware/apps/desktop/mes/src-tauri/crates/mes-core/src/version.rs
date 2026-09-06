//! 클라이언트 버전 판정.
//!
//! 서버가 모든 응답에 실어 보내는 `X-Min-Supported-Client` / `X-Client-Status` 를 해석해
//! 앱이 배너를 띄울지, 전면 안내를 띄울지 정한다.
//!
//! 파싱 실패는 차단 사유가 아니다. 서버 헤더가 깨졌다고 현장 단말이 멈추면 안 된다.

use std::cmp::Ordering;

/// major.minor.patch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Version {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

/// "1.4.2" 를 파싱한다. 형식이 다르면 None(판정 불가로 취급).
pub fn parse_version(raw: &str) -> Option<Version> {
    let mut parts = raw.trim().split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some(Version {
        major,
        minor,
        patch,
    })
}

/// a 가 b 보다 작으면 Less.
pub fn compare_versions(a: Version, b: Version) -> Ordering {
    (a.major, a.minor, a.patch).cmp(&(b.major, b.minor, b.patch))
}

/// 서버가 내려주는 클라이언트 상태. 문자열은 TS 의 `ClientStatus` 와 같다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClientStatus {
    Ok,
    Deprecated,
    SoftBlock,
    HardBlock,
}

impl ClientStatus {
    /// 헤더 문자열을 해석한다. 모르는 값은 Ok 로 본다.
    ///
    /// 서버가 나중에 새 상태를 추가해도 구버전 단말이 멈추지 않아야 한다. 미지 값에서
    /// 보수적으로 차단하면, 서버가 상태 하나 늘리는 순간 현장 전체가 선다.
    pub fn parse(raw: &str) -> Self {
        match raw.trim() {
            "deprecated" => ClientStatus::Deprecated,
            "soft-block" => ClientStatus::SoftBlock,
            "hard-block" => ClientStatus::HardBlock,
            _ => ClientStatus::Ok,
        }
    }

    /// 새 업무 입력을 막아야 하는지.
    pub fn blocks_new_work(self) -> bool {
        matches!(self, ClientStatus::SoftBlock | ClientStatus::HardBlock)
    }

    /// 동기화 push 를 막아야 하는지.
    ///
    /// 항상 false 다. 구버전 PC 를 차단해 놓고 그 PC 의 outbox 에 어제 생산실적이
    /// 남아 있으면 영구 유실이다. 이 함수는 그 불변식을 코드에 박아두기 위해 존재한다.
    /// 상수를 반환하는 것처럼 보이지만, 여기에 조건을 넣고 싶어지는 날이 반드시 온다.
    pub fn blocks_sync_push(self) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_three_part_versions() {
        assert_eq!(
            parse_version("1.4.2"),
            Some(Version {
                major: 1,
                minor: 4,
                patch: 2
            })
        );
    }

    /// 형식이 깨진 버전은 판정 불가다. 차단 사유가 아니다.
    #[test]
    fn rejects_malformed_versions() {
        assert_eq!(parse_version("1.4"), None);
        assert_eq!(parse_version("1.4.2.3"), None);
        assert_eq!(parse_version("not-a-version"), None);
    }

    #[test]
    fn compares_by_precedence() {
        let a = parse_version("1.4.2").unwrap();
        let b = parse_version("1.10.0").unwrap();
        assert_eq!(compare_versions(a, b), Ordering::Less);
    }

    /// 모르는 상태 문자열은 Ok 로 본다. 서버가 상태를 하나 늘리는 순간
    /// 현장 전체가 서면 안 된다.
    #[test]
    fn unknown_status_is_ok() {
        assert_eq!(ClientStatus::parse("brand-new-state"), ClientStatus::Ok);
        assert_eq!(ClientStatus::parse(""), ClientStatus::Ok);
    }

    /// 절대 불변식: 어떤 상태에서도 동기화 push 는 막지 않는다.
    #[test]
    fn sync_push_is_never_blocked() {
        for status in [
            ClientStatus::Ok,
            ClientStatus::Deprecated,
            ClientStatus::SoftBlock,
            ClientStatus::HardBlock,
        ] {
            assert!(!status.blocks_sync_push());
        }
        // 반면 새 업무 입력은 막힌다. 둘이 갈리는 것이 이 설계의 요점이다.
        assert!(ClientStatus::HardBlock.blocks_new_work());
        assert!(!ClientStatus::Deprecated.blocks_new_work());
    }
}
