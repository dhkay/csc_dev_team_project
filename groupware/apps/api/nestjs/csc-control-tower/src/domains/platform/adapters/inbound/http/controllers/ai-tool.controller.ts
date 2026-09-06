import { Body, Controller, Get, Inject, Param, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { PlatformAdminGuard } from '../../../../../../shared/guards';
import {
  AI_TOOL_CATALOG_PORT,
  AiToolCatalogPort,
} from '../../../../core/application/ports/inbound/ai-tool-catalog.port';
import { UpdateAiToolDto } from '../dto/update-ai-tool.dto';
import { AiToolCatalogItemResponseDto } from '../dto/ai-tool-catalog.response.dto';

/**
 * AI 도구 카탈로그 Inbound Adapter: 표시명/slug 관리(플랫폼 관리자)
 * 전역 ServiceTokenGuard(서버 간) + PlatformAdminGuard(플랫폼 관리자 JWT) 이중 보호. 내부망 전용
 * ai_tools 쓰기는 user 서버에 위임(소유권)
 */
@ApiTags('ai-tool')
@ApiBearerAuth()
@Controller('platform')
export class AiToolController {
  constructor(
    @Inject(AI_TOOL_CATALOG_PORT)
    private readonly aiToolCatalog: AiToolCatalogPort,
  ) {}

  /** AI 도구 카탈로그 목록 */
  @ApiOperation({
    summary: '[AITOOL-001] AI 도구 카탈로그 목록',
    description: 'AI 도구 카탈로그 전체 목록을 조회합니다.',
  })
  @ApiOkResponse({ type: AiToolCatalogItemResponseDto, isArray: true })
  @UseGuards(PlatformAdminGuard)
  @Get('ai-tools')
  async listAiToolCatalog() {
    return this.aiToolCatalog.listAiToolCatalog();
  }

  /** AI 도구 표시명/slug 수정 (key/enum 고정) */
  @ApiOperation({
    summary: '[AITOOL-002] AI 도구 수정',
    description: 'AI 도구의 표시명/slug 를 수정합니다. key/enum 은 고정입니다.',
  })
  @ApiOkResponse({ type: AiToolCatalogItemResponseDto })
  @ApiParam({
    name: 'key',
    description: 'AI 도구 카탈로그 key(enum 고정)',
    example: 'marketing-video',
  })
  @UseGuards(PlatformAdminGuard)
  @Patch('ai-tools/:key')
  async updateAiTool(@Param('key') key: string, @Body() dto: UpdateAiToolDto) {
    return this.aiToolCatalog.updateAiTool(key, dto);
  }
}
