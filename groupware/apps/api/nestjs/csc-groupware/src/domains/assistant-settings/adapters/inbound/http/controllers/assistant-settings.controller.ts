import { Body, Controller, Get, Inject, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ASSISTANT_SETTINGS_PORT,
  AssistantSettingsPort,
} from '../../../../core/application/ports/inbound/assistant-settings.port';
import { UpdateOrganizationAssistantSettingsDto } from '../dto/update-organization-assistant-settings.dto';

/**
 * 조직 AI 어시스턴트 설정 API: 조직 관리자(그룹웨어)가 조직 기본 모델/프롬프트 추가를 조회/수정
 * organizationId 는 신뢰된 호출자(web-groupware BFF)가 세션에서 도출해 전달(ServiceTokenGuard)
 * 플랫폼 전역 설정과의 병합은 internal resolve 가 담당(여기선 조직 오버라이드만)
 */
@ApiTags('[그룹웨어] AI 어시스턴트 설정(assistant-settings) API')
@Controller('assistant-settings')
export class AssistantSettingsController {
  constructor(
    @Inject(ASSISTANT_SETTINGS_PORT)
    private readonly service: AssistantSettingsPort,
  ) {}

  @Get()
  get(@Query('organizationId', ParseIntPipe) organizationId: number) {
    return this.service.getForOrg(organizationId);
  }

  /** 조직 기본 모델 select 후보: language-model 카탈로그 전체(모델 SSOT) */
  @Get('models')
  listModels() {
    return this.service.listModels();
  }

  @Patch()
  update(@Body() dto: UpdateOrganizationAssistantSettingsDto) {
    const { organizationId, ...patch } = dto;
    return this.service.updateForOrg(organizationId, patch);
  }
}
