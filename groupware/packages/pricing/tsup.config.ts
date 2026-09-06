import { defineConfig } from 'tsup';

// 벤더 단가 공유 커널 듀얼 빌드(CJS+ESM+d.ts): 런타임 의존성 0(@csc/entitlements 와 동일 형태)
// CommonJS NestJS(csc-marketing, 비용 계산)와 ESM SvelteKit(groupware, 가격표 표시) 양쪽이
// 같은 숫자를 쓰려면 컴파일된 dist 가 필요하다.
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
});
