import { Controller, Get, Inject, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ASSISTANT_SETTINGS_PORT,
  AssistantSettingsPort,
} from '../../../../core/application/ports/inbound/assistant-settings.port';

/**
 * 내부(서비스 간) 전용: 채팅 시점 병합 설정 해석. 전역 ServiceTokenGuard 로 보호
 * language-model 이 X-Service-Token 으로 조회한다(csc-groupware ALLOWED_SERVICES 에 language-model 등록 필요)
 * 조직 오버라이드(groupwaredb) + 플랫폼 전역(user fetch)을 병합한 effective config 반환
 */
@ApiTags('internal')
@Controller('internal/assistant-config')
export class InternalAssistantConfigController {
  constructor(
    @Inject(ASSISTANT_SETTINGS_PORT)
    private readonly service: AssistantSettingsPort,
  ) {}

  @Get('resolve')
  resolve(@Query('organizationId', ParseIntPipe) organizationId: number) {
    return this.service.resolveEffective(organizationId);
  }
}
