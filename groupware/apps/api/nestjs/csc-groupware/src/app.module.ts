import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServiceTokenGuard } from '@csc/net-utils/nest';
import { EntitlementModule } from './domains/entitlement/entitlement.module';
import { ApiCredentialModule } from './domains/api-credential/api-credential.module';
import { AssistantSettingsModule } from './domains/assistant-settings/assistant-settings.module';
import { RbfrModule } from './domains/rbfr/rbfr.module';

/**
 * 루트 DI 조립: csc 그룹웨어 API.
 * 도메인은 src/domains/<domain>/ 에 헥사곤 1개씩 추가하고 여기 imports 에 등록한다.
 * (도메인 파일 컨벤션: <domain>.entity.ts / <domain>.service.ts / <domain>.module.ts ...)
 *
 * 보안 Layer 3: ServiceTokenGuard 를 전역 가드로 등록: 모든 엔드포인트가 X-Service-Token 검증을 거친다.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EntitlementModule,
    ApiCredentialModule,
    AssistantSettingsModule,
    RbfrModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ServiceTokenGuard }],
})
export class AppModule {}
