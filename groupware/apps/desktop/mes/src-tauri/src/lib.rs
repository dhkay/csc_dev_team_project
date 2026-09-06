//! Tauri 바인딩. 얇게 유지한다.
//!
//! 여기에는 명령 등록과 상태 조립만 둔다. 도메인 로직은 crates/ 의 라이브러리 crate 에 있고,
//! 그래야 Tauri 없이 `cargo test` 로 검증된다(CI 가 Linux 러너에서 돌 수 있다).
//!
//! WebView 는 이 명령들만 알고 서버 주소도 토큰도 SQL 도 모른다.

pub mod config;

use std::sync::Arc;

use mes_store::{LocalStoreInfo, OutboxFailure, OutboxSummary, Store};
use tauri::Manager;

/// 앱 전역 상태. 저장소는 하나뿐이다(단일 writer).
pub struct AppState {
    store: Option<Arc<Store>>,
    config: config::AppConfigFile,
}

impl AppState {
    fn store(&self) -> Result<&Arc<Store>, String> {
        self.store
            .as_ref()
            // 진단 화면은 DB 가 안 열려도 떠야 한다. 못 열린 사실 자체가 진단 결과다.
            .ok_or_else(|| "로컬 저장소를 열지 못했습니다.".to_owned())
    }
}

/// 설정 조회. 프론트엔드가 빌드 상수와 병합한다(우선순위는 config.rs 문서 참고).
#[tauri::command]
fn load_app_config(state: tauri::State<'_, AppState>) -> config::AppConfigFile {
    state.config.clone()
}

/// 로컬 DB 메타. 스키마 불일치 진단의 근거.
#[tauri::command]
fn local_store_info(state: tauri::State<'_, AppState>) -> Result<LocalStoreInfo, String> {
    Ok(state.store()?.info())
}

/// outbox 요약. 상태바와 진단 화면이 읽는다.
#[tauri::command]
fn outbox_summary(state: tauri::State<'_, AppState>) -> Result<OutboxSummary, String> {
    state.store()?.outbox_summary().map_err(|e| e.to_string())
}

/// 최근 실패 항목.
#[tauri::command]
fn outbox_recent_failures(
    state: tauri::State<'_, AppState>,
    limit: u32,
) -> Result<Vec<OutboxFailure>, String> {
    state
        .store()?
        .recent_failures(limit)
        .map_err(|e| e.to_string())
}

/// 앱을 기동한다.
///
/// 저장소를 못 열어도 창은 띄운다. 현장에서 "아무것도 안 뜬다" 는 가장 진단하기 어려운
/// 상태다. 진단 화면이 떠서 원인을 보여주는 편이 훨씬 낫다.
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().ok();
            let config = config::load_config_file(config::config_path(app_data_dir.clone()));

            let store = app_data_dir.and_then(|dir| {
                if std::fs::create_dir_all(&dir).is_err() {
                    return None;
                }
                match Store::open(&dir.join("mes.db")) {
                    Ok(store) => Some(Arc::new(store)),
                    Err(error) => {
                        eprintln!("[mes] 로컬 저장소 열기 실패: {error}");
                        None
                    }
                }
            });

            app.manage(AppState { store, config });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_app_config,
            local_store_info,
            outbox_summary,
            outbox_recent_failures
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 앱 기동 실패");
}
