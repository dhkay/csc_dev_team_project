import { defineConfig } from 'tsup';

// 외부 API 프로바이더 카탈로그 공유 커널 듀얼 빌드(CJS+ESM+d.ts): 런타임 의존성 0.
// CommonJS NestJS(csc-groupware 검증/저장, csc-marketing 라우팅)와 ESM SvelteKit(groupware 등록 화면)
// 양쪽이 같은 카탈로그를 쓰려면 컴파일된 dist 가 필요하다(@csc/video-capabilities 와 동일 형태)
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
});
