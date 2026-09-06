import { defineConfig } from 'tsup';

// 로그 프로듀서 듀얼 빌드(CJS+ESM+d.ts): net-utils 와 같은 레이어링
// CommonJS NestJS 서버와 ESM SvelteKit 양쪽이 런타임에 import 하려면 컴파일된 dist 가 필요하다.
//  - `.`      코어: LogProducer(프레임워크 비종속). 의존은 @csc/log-contracts 하나
//  - `./nest` NestJS 바인딩: @nestjs/common 은 peer(외부 유지, 번들 제외)
export default defineConfig({
  entry: ['src/index.ts', 'src/nest/index.ts'],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  external: ['@nestjs/common'],
});
