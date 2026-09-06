import { defineConfig } from 'tsup';

// 사가 엔진 듀얼 빌드(CJS+ESM+d.ts). CommonJS NestJS 서버가 런타임에 import 하려면 dist 가 필요하다.
//  - `.`         코어: 런타임 의존성 0. 프레임워크도 ORM 도 모른다(순수 TS)
//  - `./nest`    NestJS 배선: 모듈/스케줄러/필터. @nestjs/* 는 peer(외부 유지)
//  - `./drizzle` Drizzle 저장소: 테이블 정의 + 어댑터 팩토리. drizzle-orm 은 peer.
//  - `./testing` 인메모리 저장소: 앱 테스트가 진짜 러너로 돌 수 있게 한다.
export default defineConfig({
  entry: [
    'src/index.ts',
    'src/nest/index.ts',
    'src/drizzle/index.ts',
    'src/testing/index.ts',
  ],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  external: [
    '@nestjs/common',
    '@nestjs/schedule',
    'drizzle-orm',
    'drizzle-orm/pg-core',
    // 코어를 외부로: 엔트리마다 복사되면 클래스/심볼 동일성이 깨진다(DI 토큰, @Catch)
    '@csc/saga',
  ],
});
