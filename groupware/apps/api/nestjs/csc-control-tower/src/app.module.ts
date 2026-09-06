import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServiceTokenGuard } from '@csc/net-utils/nest';
import { PlatformModule } from './domains/platform/platform.module';
import { ServerMonitoringModule } from './domains/server-monitoring/server-monitoring.module';

/**
 * 루트 DI 조립: csc 컨트롤타워 API (플랫폼 운영사 백엔드)
 * 도메인은 src/domains/<domain>/ 에 헥사곤 1개씩 추가하고 여기 imports 에 등록한다.
 *
 * 전역 ServiceTokenGuard 는 서버 간 호출만 검증한다. 플랫폼 관리자 JWT 인가는 도메인
 * 컨트롤러의 PlatformAdminGuard 가 따로 담당한다.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PlatformModule, ServerMonitoringModule],
  providers: [{ provide: APP_GUARD, useClass: ServiceTokenGuard }],
})
export class AppModule {}
