import { defineConfig } from 'tsup';

// 영상 모델 역량 공유 커널 듀얼 빌드(CJS+ESM+d.ts): 런타임 의존성 0(@csc/pricing 과 동일 형태)
// CommonJS NestJS(csc-marketing, 요청 clamp)와 ESM SvelteKit(groupware, 선택지 표시) 양쪽이
// 같은 표를 쓰려면 컴파일된 dist 가 필요하다.
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
});
