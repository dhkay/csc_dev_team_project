import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// 앱 버전의 단일 출처는 package.json 이다. 화면(진단), X-Client-Version 헤더, 릴리스 태그가
// 같은 값을 봐야 현장 문의에서 "그 PC 버전이 뭐냐" 가 한 번에 끝난다.
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string };

// dev 포트 5175 (5173 groupware, 5174 control-tower 다음 자리)
// 이 앱은 `pnpm dev` 기본 세트에 들어가지 않는다. Tauri 창은 포트를 열지 않아
// scripts/dev-apps.mjs 의 TCP 프로브로는 살아있는지 판정할 수 없고, 첫 cargo 빌드가
// 수 분이라 매번 네이티브 창이 뜨면 전체 dev 경험이 망가지기 때문이다.
export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // Tauri CLI 가 출력을 관리하므로 vite 가 화면을 지우면 오류 메시지가 사라진다.
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    watch: {
      // Rust 빌드 산출물은 감시 대상이 아니다. 감시하면 cargo 빌드마다 HMR 이 폭주한다.
      ignored: ['**/src-tauri/**'],
    },
  },
  test: {
    include: ['tests/unit/**/*.test.{js,ts}'],
    environment: 'node',
    expect: { requireAssertions: true },
  },
});
