import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiCredentialPort,
  API_CREDENTIAL_PORT,
} from '../../../../core/application/ports/inbound';
import { DeleteApiCredentialDto, SaveApiCredentialDto } from '../dto';

/**
 * 공용 API 자격증명 API: 조직별 외부 API 키(예: Claude API) 등록/삭제(암호화 저장)
 * organizationId 는 신뢰된 호출자(web-groupware BFF)가 세션에서 도출해 전달한다(ServiceTokenGuard)
 * 응답에는 자격증명 값이 없다(configuredFields 만). 내부 resolveCredentials 는 라우트로 노출하지 않는다.
 */
@ApiTags('[그룹웨어] 공용 API 자격증명(api-credential) API')
@Controller('api-credentials')
export class ApiCredentialController {
  constructor(
    @Inject(API_CREDENTIAL_PORT)
    private readonly service: ApiCredentialPort,
  ) {}

  @Get()
  list(@Query('organizationId', ParseIntPipe) organizationId: number) {
    return this.service.listViewsForOrg(organizationId);
  }

  /**
   * 논-시크릿: 등록된 프로바이더 key 목록만(값/필드명 없음)
   * 목록(@Get())은 ROOT 전용 게이트지만, 이 경로는 조직 스코프 편집자(팀장 등)가
   * 마케팅 AI 모델 게이팅에 쓰도록 BFF 에서 org-member 게이트로 노출한다.
   */
  @Get('configured')
  listConfigured(@Query('organizationId', ParseIntPipe) organizationId: number) {
    return this.service.listConfiguredProviders(organizationId);
  }

  @Post()
  save(@Body() dto: SaveApiCredentialDto) {
    return this.service.saveCredential(dto.organizationId, dto.provider, dto.credentials);
  }

  @Delete()
  async remove(@Body() dto: DeleteApiCredentialDto) {
    await this.service.deleteCredential(dto.organizationId, dto.provider);
    return { success: true };
  }
}
