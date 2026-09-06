import { Controller, Get, Inject, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiCredentialPort,
  API_CREDENTIAL_PORT,
} from '../../../../core/application/ports/inbound';

/**
 * 내부(서비스 간) 전용 Inbound Adapter: 조직 공용 API 자격증명 해석
 * 전역 ServiceTokenGuard 로 보호된다(user 서버 InternalController 동형: 별도 데코레이터 불필요)
 *
 * 피어 백엔드(예: language-model)가 요청의 X-Organization-Id 로 도출한 organizationId + provider 로
 * 복호화된 자격증명 맵(예: { apiKey })을 조회한다. 미등록이면 null 을 반환(200). 이 경로는
 * 브라우저/공개 도메인으로 노출되지 않으며(내부망 + 서비스토큰), 복호화 값은 신뢰된 피어에게만 전달된다.
 */
@ApiTags('[그룹웨어][내부] 공용 API 자격증명 resolve')
@Controller('internal/api-credentials')
export class InternalApiCredentialController {
  constructor(
    @Inject(API_CREDENTIAL_PORT)
    private readonly service: ApiCredentialPort,
  ) {}

  @Get('resolve')
  resolve(
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('provider') provider: string,
  ): Promise<Record<string, string> | null> {
    return this.service.resolveCredentials(organizationId, provider);
  }
}
