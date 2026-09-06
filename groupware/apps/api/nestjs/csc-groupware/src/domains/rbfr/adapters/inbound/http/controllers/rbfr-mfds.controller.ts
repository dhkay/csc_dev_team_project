import { Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { RBFR_MFDS_SYNC_PORT, type RbfrMfdsSyncPort } from '../../../../core/application/ports/inbound/rbfr-mfds-sync.port';

/**
 * 02_화면구성.md 탭3 "성분사전 조회"(F-90) + 관리 배치(F-92) 진입점. 04_식약청API연동.md가 원본 스펙.
 * `POST mfds/sync`는 21,897건을 22페이지로 내려받는 무거운 호출이라 UI에 상시 노출하지 않고
 * 관리자 액션/스케줄러 전용으로 둔다(호출 한도 있음, 04번 문서 "주의" 참고).
 */
@Controller('rbfr-api/mfds')
export class RbfrMfdsController {
  constructor(
    @Inject(RBFR_MFDS_SYNC_PORT)
    private readonly mfdsSync: RbfrMfdsSyncPort,
  ) {}

  @Get('search')
  async search(@Query('nameKo') nameKo: string) {
    return await this.mfdsSync.searchIngredientDictionary(nameKo);
  }

  @Post('sync')
  async sync() {
    return await this.mfdsSync.syncFullDictionary();
  }
}
