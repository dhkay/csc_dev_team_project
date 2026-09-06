import { Controller, Get, Inject, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AiToolResolved } from '../../../../core/domain/ai-tool.types';
import {
  EntitlementPort,
  ENTITLEMENT_PORT,
} from '../../../../core/application/ports/inbound/entitlement.port';

/**
 * 엔타이틀먼트 Inbound Adapter: BFF(web-groupware) 가 서비스토큰으로 호출
 * 조직 AI도구 부여 목록을 user 서버로 위임 조회한다(엔타이틀먼트는 userdb 소유)
 *
 * 인가 경계: orgId 는 BFF 가 백엔드 검증된 세션(find/data)에서 도출해 전달한다(클라이언트 비선택)
 */
@ApiTags('entitlement')
@Controller('organizations')
export class EntitlementController {
  constructor(
    @Inject(ENTITLEMENT_PORT)
    private readonly entitlement: EntitlementPort,
  ) {}

  /** 조직에 부여된 AI도구(표시명+slug 포함) */
  @Get(':id/ai-tools')
  @ApiOperation({ summary: '[ENTITLEMENT-001] 조직 AI도구 조회', description: '조직에 부여된 AI도구 목록(표시명+slug)을 user 서버에서 위임 조회한다.' })
  @ApiParam({ name: 'id', description: '조직 ID', example: 1 })
  async getOrganizationAiTools(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AiToolResolved[]> {
    return this.entitlement.getOrganizationAiTools(id);
  }
}
