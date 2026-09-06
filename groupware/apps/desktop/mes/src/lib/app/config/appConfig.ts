/**
 * 런타임 설정
 *
 * 우선순위: `%APPDATA%/csc-mes/config.json` > 빌드 상수 > 하드코딩 기본값
 *
 * 서버 주소와 업데이트 엔드포인트를 빌드에 구우면 이미 현장에 깔린 앱은 고칠 방법이 없다.
 * 사람이 PC 마다 재설치하러 가야 한다. 이 앱은 클라우드와 온프렘 폐쇄망 양쪽에 같은 바이너리로
 * 나가야 하므로 런타임 주입이 전제 조건이다. 코드량은 작지만 나중에는 못 넣는 결정이다.
 *
 * 실제 파일 읽기는 Rust 가 한다(WebView 에는 파일시스템 권한을 주지 않는다)
 */
import { invokeOrNull } from '$lib/infrastructure/local/tauri';

export interface AppConfig {
  // csc-mes 베이스 URL
  apiBaseUrl: string;
  // Tauri updater 매니페스트 URL. 폐쇄망은 사내 서버를 가리킨다.
  updateEndpoint: string;
  // 릴리스 채널 (dev / staging / prod)
  channel: string;
  // 단말 식별자. 등록(enrollment) 시 서버가 발급한다.
  deviceId: string | null;
  // 사이트 코드. 표시와 진단 번들 라벨링에 쓴다.
  siteCode: string | null;
}

/** 하드코딩 기본값. 아무 설정도 없을 때의 마지막 폴백(로컬 개발 기준) */
const FALLBACK: AppConfig = {
  apiBaseUrl: 'http://localhost:3004',
  updateEndpoint: 'http://localhost:3004/desktop/latest.json',
  channel: 'dev',
  deviceId: null,
  siteCode: null,
};

/** 빌드 시점 상수. vite 의 VITE_ 접두 환경변수로 주입한다. */
function buildTimeConfig(): Partial<AppConfig> {
  const env = import.meta.env as Record<string, string | undefined>;
  return {
    apiBaseUrl: env.VITE_MES_API_BASE_URL,
    updateEndpoint: env.VITE_MES_UPDATE_ENDPOINT,
    channel: env.VITE_MES_CHANNEL,
  };
}

/** undefined 필드는 덮어쓰지 않는다(빈 문자열도 무시: 미설정 env 가 ''로 오는 경우 방어) */
function merge(base: AppConfig, patch: Partial<AppConfig> | null): AppConfig {
  if (!patch) return base;
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && value !== null && value !== '') {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

let cached: AppConfig | null = null;

/**
 * 설정을 해석한다. Tauri 밖(브라우저 단독 개발)에서는 config.json 단계를 건너뛴다.
 * 실패해도 예외를 던지지 않는다. 설정 파일이 깨졌다고 앱이 안 뜨면 현장에서 고칠 방법이 없다.
 */
export async function loadAppConfig(): Promise<AppConfig> {
  if (cached) return cached;
  const withBuild = merge(FALLBACK, buildTimeConfig());
  const fromFile = await invokeOrNull<Partial<AppConfig>>('load_app_config');
  cached = merge(withBuild, fromFile);
  return cached;
}

/** 진단 화면 등에서 재조회할 때 */
export function resetAppConfigCache(): void {
  cached = null;
}
