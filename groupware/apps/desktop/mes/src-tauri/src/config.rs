//! 런타임 설정 로더.
//!
//! 우선순위: `%APPDATA%/csc-mes/config.json` > 빌드 상수 > 하드코딩 기본값
//! (빌드 상수는 프론트엔드가 vite 로 주입하므로 Rust 는 파일 단계만 담당한다.)
//!
//! 서버 주소와 업데이트 엔드포인트를 빌드에 구우면 이미 현장에 깔린 앱은 고칠 방법이 없다.
//! 사람이 PC 마다 재설치하러 가야 한다. 이 앱은 클라우드와 온프렘 폐쇄망 양쪽에 같은
//! 바이너리로 나가야 하므로 런타임 주입이 전제 조건이다.
//!
//! 파일 읽기를 Rust 가 하는 이유: WebView 에 파일시스템 권한을 주지 않는다.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// 설정 디렉터리 이름. Windows 는 `%APPDATA%/csc-mes/`.
const CONFIG_DIR: &str = "csc-mes";
const CONFIG_FILE: &str = "config.json";

/// config.json 의 내용. 모든 필드가 선택이라 일부만 적어도 된다.
///
/// 없는 필드는 프론트엔드가 빌드 상수와 기본값으로 채운다. 설정 파일에 한 줄만 적어
/// 서버 주소를 바꾸는 것이 현장 운영에서 가장 흔한 작업이다.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfigFile {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub site_code: Option<String>,
}

/// 설정 파일 경로. 부모 디렉터리가 없으면 만들지 않는다(읽기 전용 동작).
pub fn config_path(app_data_dir: Option<PathBuf>) -> Option<PathBuf> {
    app_data_dir.map(|base| base.join(CONFIG_DIR).join(CONFIG_FILE))
}

/// 설정을 읽는다.
///
/// 어떤 실패에도 예외를 올리지 않고 기본값(빈 설정)을 돌려준다. 설정 파일이 깨졌다고
/// 앱이 안 뜨면 현장에서 고칠 방법이 없다. 무엇이 적용됐는지는 진단 화면이 보여준다.
pub fn load_config_file(path: Option<PathBuf>) -> AppConfigFile {
    let Some(path) = path else {
        return AppConfigFile::default();
    };
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return AppConfigFile::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 파일이 없으면 빈 설정이다. 앱은 정상 기동해야 한다.
    #[test]
    fn missing_file_yields_defaults() {
        let config = load_config_file(Some(PathBuf::from("/definitely/not/here/config.json")));
        assert!(config.api_base_url.is_none());
    }

    /// 경로 자체를 못 구해도 마찬가지다.
    #[test]
    fn missing_path_yields_defaults() {
        let config = load_config_file(None);
        assert!(config.api_base_url.is_none());
    }

    /// JSON 이 깨져도 기동을 막지 않는다. 현장에서 손으로 편집하다 쉼표 하나 빠지는 일이
    /// 실제로 일어나고, 그때 앱이 안 뜨면 아무도 복구하지 못한다.
    #[test]
    fn broken_json_yields_defaults() {
        let dir = std::env::temp_dir().join(format!("mes-config-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("broken.json");
        std::fs::write(&path, "{ this is not json").unwrap();

        let config = load_config_file(Some(path.clone()));
        assert!(config.api_base_url.is_none());

        let _ = std::fs::remove_file(&path);
    }

    /// 일부 필드만 적어도 그 값만 반영된다.
    #[test]
    fn partial_config_is_accepted() {
        let dir = std::env::temp_dir().join(format!("mes-config-partial-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("partial.json");
        std::fs::write(&path, r#"{"apiBaseUrl":"https://mes.example.com"}"#).unwrap();

        let config = load_config_file(Some(path.clone()));
        assert_eq!(
            config.api_base_url.as_deref(),
            Some("https://mes.example.com")
        );
        assert!(config.channel.is_none());

        let _ = std::fs::remove_file(&path);
    }
}
