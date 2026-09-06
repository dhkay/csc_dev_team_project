import { defineConfig } from 'tsup';

// 엔타이틀먼트 카탈로그 공유 커널 듀얼 빌드(CJS+ESM+d.ts): 런타임 의존성 0.
// CommonJS NestJS 서버(user)와 ESM SvelteKit BFF(groupware/control-tower) 양쪽이
// 런타임에 import 하려면 .ts 소스가 아니라 컴파일된 dist 가 필요하다(@csc/net-utils 와 동일)
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
});
