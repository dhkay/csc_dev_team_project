import { Module } from '@nestjs/common';
import {
  UserApiClientService,
  UserApiTokenService,
} from '../../shared/adapters/outbound/user-api';
import { EntitlementController } from './adapters/inbound/http/controllers/entitlement.controller';
import { EntitlementUserApiAdapter } from './adapters/outbound/http/user-api/user-api.adapter';
import { EntitlementService } from './core/application/services/entitlement.service';
import { ENTITLEMENT_PORT } from './core/application/ports/inbound/entitlement.port';
import { ENTITLEMENT_USER_API_PORT } from './core/application/ports/outbound/user-api.port';

/**
 * 엔타이틀먼트 도메인: 조직 AI도구 부여 조회
 * ai_tools/organization_ai_tools 는 userdb(SSoT) = user 서버 소유. csc-groupware 는 게이트 + 위임만
 */
@Module({
  controllers: [EntitlementController],
  providers: [
    { provide: ENTITLEMENT_PORT, useClass: EntitlementService },
    { provide: ENTITLEMENT_USER_API_PORT, useClass: EntitlementUserApiAdapter },
    UserApiClientService,
    UserApiTokenService,
  ],
})
export class EntitlementModule {}
