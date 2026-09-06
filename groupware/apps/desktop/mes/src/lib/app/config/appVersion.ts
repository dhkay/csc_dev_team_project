/**
 * 앱 버전. 단일 출처는 package.json 이고 vite 가 빌드 시점에 주입한다(vite.config.ts)
 *
 * 이 값이 화면(진단), X-Client-Version 요청 헤더, 릴리스 태그에서 같아야 현장 문의에서
 * "그 PC 버전이 뭐냐" 가 한 번에 끝난다. 세 곳에 손으로 적으면 반드시 갈린다.
 */
export const version: string =
  (import.meta.env as Record<string, string | undefined>).VITE_APP_VERSION ?? '0.0.0-dev';
