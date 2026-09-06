// Windows 릴리스 빌드에서 콘솔 창이 함께 뜨는 것을 막는다. 현장 PC 에 검은 창이 하나 더
// 뜨면 작업자가 그걸 닫다가 앱까지 닫는다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mes_app_lib::run()
}
