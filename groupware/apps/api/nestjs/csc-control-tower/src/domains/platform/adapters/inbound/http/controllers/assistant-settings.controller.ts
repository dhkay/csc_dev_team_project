import { Body, Controller, Get, Inject, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PlatformAdminGuard } from '../../../../../../shared/guards';
import {
  ASSISTANT_SETTINGS_PORT,
  AssistantSettingsPort,
} from '../../../../core/application/ports/inbound/assistant-settings.port';
import { UpdatePlatformAssistantSettingsDto } from '../dto/update-platform-assistant-settings.dto';
import { PlatformAssistantSettingsResponseDto } from '../dto/platform-assistant-settings.response.dto';

/**
 * 플랫폼 AI 어시스턴트 전역 설정 Inbound Adapter: 플랫폼 관리자
 * 전역 ServiceTokenGuard(서버 간) + PlatformAdminGuard(플랫폼 관리자 JWT) 이중 보호. 내부망 전용
 * userdb 싱글톤 쓰기는 user 서버에 위임(소유권)
 */
@ApiTags('assistant-settings')
@ApiBearerAuth()
@Controller('platform')
export class AssistantSettingsController {
  constructor(
    @Inject(ASSISTANT_SETTINGS_PORT)
    private readonly assistantSettings: AssistantSettingsPort,
  ) {}

  @ApiOperation({
    summary: '[ASSISTANT-001] AI 어시스턴트 전역 설정 조회',
    description: 'AI 어시스턴트 전역 설정(활성 킬스위치/공통 프롬프트)을 조회합니다.',
  })
  @ApiOkResponse({ type: PlatformAssistantSettingsResponseDto })
  @UseGuards(PlatformAdminGuard)
  @Get('assistant-settings')
  async getSettings() {
    return this.assistantSettings.getSettings();
  }

  @ApiOperation({
    summary: '[ASSISTANT-002] AI 어시스턴트 전역 설정 수정',
    description: 'AI 어시스턴트 전역 설정을 수정합니다(제공된 필드만).',
  })
  @ApiOkResponse({ type: PlatformAssistantSettingsResponseDto })
  @UseGuards(PlatformAdminGuard)
  @Patch('assistant-settings')
  async updateSettings(@Body() dto: UpdatePlatformAssistantSettingsDto) {
    return this.assistantSettings.updateSettings(dto);
  }
}
