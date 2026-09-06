import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServiceTokenGuard } from '@csc/net-utils/nest';
import { HealthModule } from './health/health.module';

/**
 * 루트 DI 조립: csc MES API.
 * 도메인은 src/domains/<domain>/ 에 헥사곤 1개씩 추가하고 여기 imports 에 등록한다.
 *
 * 보안 Layer 3 으로 공유 ServiceTokenGuard 를 전역 가드로 등록한다. Phase 1-B 에서
 * MesEdgeGuard 로 교체하되 공유 가드에 디바이스 분기를 넣지 않는다. 넣으면 나머지 NestJS
 * 서버 4개의 보안 동작까지 바뀐다.
 *
 * 데스크톱 바이너리에는 SERVICE_TOKEN_SECRET 을 어떤 형태로도 넣지 않는다. 전 백엔드가
 * 공유하는 시크릿이라 유출되면 모든 csc 서버가 위조 호출에 열린다.
 * 계약: docs/specs/service-http-contract.md
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), HealthModule],
  providers: [{ provide: APP_GUARD, useClass: ServiceTokenGuard }],
})
export class AppModule {}
