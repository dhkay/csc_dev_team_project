import { defineConfig } from 'tsup';

// 공유 DB 패키지 듀얼 빌드(CJS+ESM+d.ts)
// CommonJS NestJS 서버(user/csc-groupware/csc-control-tower)가 런타임에 import 하려면
// .ts 소스가 아니라 컴파일된 dist 가 필요하다. subpath export 별로 엔트리를 분리한다.
export default defineConfig({
  entry: [
    'src/index.ts',
    'src/groupwaredb/index.ts',
    'src/userdb/index.ts',
    'src/controltowerdb/index.ts',
    'src/marketingdb/index.ts',
    'src/mesdb/index.ts',
  ],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  // drizzle-orm / postgres 는 런타임 의존성으로 외부 유지(번들 제외)
  external: ['drizzle-orm', 'postgres'],
});
