/**
 * SPA 고정. 서버 렌더링과 프리렌더를 모두 끈다.
 *
 * adapter-static + fallback 조합에서 이 둘을 켜면 빌드가 라우트를 정적 페이지로 만들려 하고,
 * 그 순간 "네트워크 없이도 뜨는 앱" 이라는 전제가 깨진다(빌드 시점에 없는 라우트가 생긴다)
 */
export const ssr = false;
export const prerender = false;
export const trailingSlash = 'never';
