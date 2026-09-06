import { defineConfig } from 'tsup';

// 통합 문서 포털(scalar-gateway) 빌드: 단일 ESM 엔트리
// 런타임 의존성(express, http-proxy-middleware, @scalar/*, @csc/net-utils)은 external 로 두고
// pnpm deploy --prod 로 가져온 node_modules 에서 해석한다(NestJS 서버와 동일한 배포 패턴)
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  dts: false,
});
