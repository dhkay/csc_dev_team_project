import { defineConfig } from 'tsup';

// 공유 네트워크 유틸 듀얼 빌드(CJS+ESM+d.ts)
// CommonJS NestJS 서버(user/csc-groupware/csc-control-tower)와 ESM SvelteKit BFF 양쪽이
// 런타임에 import 하려면 .ts 소스가 아니라 컴파일된 dist 가 필요하다.
//  - `.`      코어: 런타임 의존성 0 (node:crypto / global fetch)
//  - `./nest` NestJS 어댑터: @nestjs/* 는 peer(외부 유지, 번들 제외)
export default defineConfig({
  entry: ['src/index.ts', 'src/nest/index.ts'],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  external: ['@nestjs/common', '@nestjs/swagger'],
});
