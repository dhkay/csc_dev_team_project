import { defineConfig } from 'tsup';

// 도구 버전 축 공유 커널 듀얼 빌드(CJS+ESM+d.ts): 런타임 의존성 0(@csc/video-capabilities 와 동일 형태)
// CommonJS NestJS(csc-marketing, 요청 검증과 파이프라인 분기)와 ESM SvelteKit(groupware, 화면 구성과
// 라우트 축) 양쪽이 같은 표를 쓰려면 컴파일된 dist 가 필요하다.
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
});
