import { defineConfig } from 'tsup';

// MES 계약 공유 커널 듀얼 빌드(CJS+ESM+d.ts): 런타임 의존성 0.
// 소비자가 셋이라 듀얼 빌드가 필요하다.
//   - csc-mes (CommonJS NestJS)
//   - apps/desktop/mes (ESM SvelteKit)
//   - apps/web/groupware (ESM SvelteKit, 관리자 집계 화면. Phase 3)
// @csc/entitlements 와 동일한 구성
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
});
