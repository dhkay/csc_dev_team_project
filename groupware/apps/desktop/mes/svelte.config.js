import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// 데스크톱 셸은 정적 SPA 로 빌드한다(기존 web 앱 2개의 adapter-node BFF 와 다르다)
//
// 왜: 오프라인 우선이 요구다. 원격 서버에서 HTML/JS 를 받아오는 구조면 네트워크가 끊긴 순간
// 흰 화면이 되어 라인이 멈춘다. fallback 을 두어 클라이언트 라우팅이 모든 경로를 처리한다
//
// 이 선택의 대가: +server.ts / +page.server.ts / hooks.server.ts / $env/dynamic/private 를
// 쓸 수 없다. 그 책임(토큰 보관, 백엔드 주소, HTTP 호출)은 전부 Rust 측으로 이관된다
/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: 'index.html', strict: false }),
  },
};
