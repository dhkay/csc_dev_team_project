import { Controller, Get, Inject, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  PathToolVersion,
  TOOL_VERSION_ROUTE,
} from '../../../../../../shared/adapters/inbound/http/tool-version.route';
import type { ToolVersion } from '../../../../../../shared/domain/tool-version';
import { ownerVersionScope } from '../../../../../../shared/domain/workspace-scope';
import {
  PlanGenerationPort,
  PLAN_GENERATION_PORT,
} from '../../../../core/application/ports/inbound';

/**
 * 이미지 생성 대기열 현황 API.
 *
 * 경로가 `channels/...` 가 아닌 이유: 대기열은 조회하는 사람이 고른 이미지 모델의 엔진에 달렸고
 * 채널과 무관하다(모델 선택이 개인 설정이라 채널 스코프가 아니다)
 * 버전은 받는다. 고른 이미지 모델이 버전 슬롯에 있으므로 버전이 다르면 다른 엔진의 대기열이다.
 */
@ApiTags('[마케팅] 기획서 생성(plan-generation) API')
@ApiParam({
  name: 'version',
  description: '도구 버전(v1.0 / v1.5). 이 버전에서 고른 이미지 모델의 엔진 기준이다.',
})
@Controller(`${TOOL_VERSION_ROUTE}/plans`)
export class ImageEngineLoadController {
  constructor(
    @Inject(PLAN_GENERATION_PORT)
    private readonly planService: PlanGenerationPort,
  ) {}

  @ApiOperation({
    summary: '[PLAN-012] 이미지 생성 대기열 현황',
    description:
      '이미지를 만들기 전에 지금 얼마나 밀려 있는지 보여주기 위한 값이다. 사내 GPU 를 여럿이 나눠 쓰는 ' +
      '모델일 때만 대기 건수가 오고, 외부 업체 모델이거나 모델을 고르지 않았으면 null 이 온다. ' +
      'null 은 오류가 아니라 보여줄 대기열이 없다는 뜻이다.',
  })
  @ApiQuery({ name: 'organizationId', description: '조회 대상이 속한 조직 id.' })
  @ApiQuery({
    name: 'ownerUserId',
    description: '조회하는 사람(조직유저) id. 대기열은 그 사람이 고른 이미지 모델의 엔진 기준이다.',
  })
  @Get('image-engine-load')
  getSceneImageEngineLoad(
    @PathToolVersion() version: ToolVersion,
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('ownerUserId', ParseIntPipe) ownerUserId: number,
  ) {
    return this.planService.getSceneImageEngineLoad(
      ownerVersionScope({ organizationId, ownerUserId, version }),
    );
  }
}
