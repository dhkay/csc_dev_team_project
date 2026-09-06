import { defineConfig } from 'tsup';

// 로그 엔벨로프 계약 공유 커널 듀얼 빌드(CJS+ESM+d.ts): 런타임 의존성 0.
// CommonJS NestJS 서버(csc-marketing/csc-control-tower/user/csc-groupware)와 ESM SvelteKit BFF
// 양쪽이 런타임에 import 하려면 .ts 소스가 아니라 컴파일된 dist 가 필요하다(@csc/entitlements 와 동일)
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
});
