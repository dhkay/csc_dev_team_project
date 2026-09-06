import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  PathToolVersion,
  TOOL_VERSION_ROUTE,
} from '../../../../../../shared/adapters/inbound/http/tool-version.route';
import type { ToolVersion } from '../../../../../../shared/domain/tool-version';
import {
  ownerVersionScope,
  workspaceScope,
} from '../../../../../../shared/domain/workspace-scope';
import { SavedPlanPort, SAVED_PLAN_PORT } from '../../../../core/application/ports/inbound';
import { SavePlanDto, UpdateSceneDto, toSavedPlanScenes, toSavedPlanBgm } from '../dto';

/**
 * 저장된 기획안 API: 개인 워크스페이스(작업자 × 채널 × 도구 버전)
 * organizationId/ownerUserId 는 신뢰된 호출자(web-groupware BFF)가 세션에서 도출해 전달한다.
 * (ServiceTokenGuard 로 호출자 인증: 개인 격리는 BFF 신뢰 + ownerUserId 스코프)
 *
 * 도구 버전은 경로 세그먼트다: 기획안은 버전 소유이고 v1.0 과 v1.5 는 별개 워크스페이스다.
 * 세그먼트가 없으면 404, 모르는 값이면 400 이라 버전 없는 호출이 조용히 통과하지 않는다.
 */
@ApiTags('[마케팅] 저장된 기획안(saved-plan) API')
@ApiParam({
  name: 'version',
  description: '도구 버전(v1.0 / v1.5). 기획안은 버전마다 별개 워크스페이스에 담긴다.',
})
@Controller(`${TOOL_VERSION_ROUTE}/saved-plans`)
export class SavedPlanController {
  constructor(
    @Inject(SAVED_PLAN_PORT)
    private readonly savedPlanService: SavedPlanPort,
  ) {}

  @ApiOperation({
    summary: '[PLAN-007] 기획안 저장',
    description:
      '생성한 기획안을 작업자의 보관 공간에 담는다. 기획안 생성 자체는 결과를 남기지 않으므로, 계속 쓰려면 ' +
      '이 경로로 저장해야 한다. 저장 시점의 브랜드명, 씬 목록, 배경음악, 사용 모델을 함께 굳혀 두므로 ' +
      '나중에 채널 설정이 바뀌어도 저장본은 그대로다. ' +
      '기획 LLM 은 설정에서 다시 읽지 않고 llmModel 로 받는다. 기획안 생성 응답이 돌려준 값을 그대로 ' +
      '실어 보낸다. 필수이며, 빠지면 400 이다(그 값은 생성 순간에만 알 수 있어 나중에 되메울 수 없다). ' +
      '고정 모델이 있는 버전에서는 무엇을 보내도 그 버전의 모델로 기록된다. ' +
      'clientRequestId 를 함께 보내면 같은 값으로 다시 저장해도 새로 만들지 않고 먼저 저장된 것을 ' +
      '그대로 돌려준다. 저장이 실패했는지 확실하지 않을 때 그대로 다시 보내도 안전하다.',
  })
  @ApiResponse({
    status: 400,
    description: '본문 검증에 실패했다. 필수 항목(llmModel 등) 누락도 여기에 해당한다.',
  })
  @Post()
  savePersonal(@PathToolVersion() version: ToolVersion, @Body() dto: SavePlanDto) {
    const scope = ownerVersionScope({
      organizationId: dto.organizationId,
      ownerUserId: dto.ownerUserId,
      version,
    });
    return this.savedPlanService.savePersonal(scope, {
      channelId: dto.channelId ?? null,
      brandName: dto.brandName,
      clientRequestId: dto.clientRequestId ?? null,
      brandConcepts: dto.brandConcepts ?? [],
      // 필수 필드라 `??` 를 두지 않는다: 없으면 DTO 검증에서 이미 400 이다.
      llmModel: dto.llmModel,
      videoModel: dto.videoModel ?? '',
      segmentMode: dto.segmentMode ?? '',
      title: dto.title,
      summary: dto.summary,
      scenes: toSavedPlanScenes(dto.scenes),
      sceneImages: dto.sceneImages,
      bgm: toSavedPlanBgm(dto.bgm),
    });
  }

  @ApiOperation({
    summary: '[PLAN-008] 저장된 기획안 목록',
    description: '그 작업자가 그 채널에서 저장한 기획안을 최근 순으로 반환한다.',
  })
  @ApiQuery({ name: 'organizationId', description: '조직 id.' })
  @ApiQuery({ name: 'ownerUserId', description: '작업자(조직유저) id. 워크스페이스는 사람마다 분리되므로 남의 것은 조회되지 않는다.' })
  @ApiQuery({ name: 'channelId', description: '워크스페이스는 채널별로도 분리된다. 필수이며 빠지면 400 이다(전 채널이 섞이는 것을 막는다).' })
  @Get()
  listPersonal(
    @PathToolVersion() version: ToolVersion,
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('ownerUserId', ParseIntPipe) ownerUserId: number,
    // 워크스페이스는 채널별로 분리된다. 필수 파라미터라 누락 시 400 으로 막는다.
    // (선택으로 두면 전 채널이 섞인 목록이 조용히 나가 분리가 무너진다)
    @Query('channelId', ParseIntPipe) channelId: number,
  ) {
    return this.savedPlanService.listPersonal(
      workspaceScope({ organizationId, ownerUserId, channelId, version }),
    );
  }

  @ApiOperation({
    summary: '[PLAN-009] 저장본 씬 편집',
    description:
      '저장된 기획안의 씬 하나를 고친다. 씬 설명만 바꿀 수도 있고 이미지를 다른 것으로 갈아 끼울 수도 있다. ' +
      '이미지를 바꾸면 이전 이미지는 저장소에서 정리된다.',
  })
  @ApiParam({ name: 'id', description: '저장된 기획안 id.' })
  @ApiParam({ name: 'index', description: '고칠 씬의 순번(0부터).' })
  @ApiResponse({ status: 404, description: '그 저장본이 없거나 다른 작업자의 것이다.' })
  @Patch(':id/scenes/:index')
  async updateScene(
    @PathToolVersion() version: ToolVersion,
    @Param('id', ParseIntPipe) id: number,
    @Param('index', ParseIntPipe) index: number,
    @Body() dto: UpdateSceneDto,
  ) {
    const scope = ownerVersionScope({
      organizationId: dto.organizationId,
      ownerUserId: dto.ownerUserId,
      version,
    });
    const updated = await this.savedPlanService.updateScenePersonal(scope, id, {
      index,
      uploadId: dto.uploadId,
      prompt: dto.prompt,
      imagePrompt: dto.imagePrompt,
    });
    if (!updated) throw new NotFoundException('저장본을 찾을 수 없습니다.');
    return updated;
  }

  @ApiOperation({
    summary: '[PLAN-010] 저장본 삭제',
    description:
      '저장된 기획안과 그 기획안이 쓰던 씬 이미지를 함께 지운다. 없거나 남의 것이면 success 가 false 로 ' +
      '오며 오류가 아니다. 되돌릴 수 없다.',
  })
  @ApiParam({ name: 'id', description: '삭제할 저장본 id.' })
  @ApiQuery({ name: 'organizationId', description: '조직 id.' })
  @ApiQuery({ name: 'ownerUserId', description: '작업자(조직유저) id. 워크스페이스는 사람마다 분리되므로 남의 것은 조회되지 않는다.' })
  @Delete(':id')
  async deletePersonal(
    @PathToolVersion() version: ToolVersion,
    @Param('id', ParseIntPipe) id: number,
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('ownerUserId', ParseIntPipe) ownerUserId: number,
  ) {
    const removed = await this.savedPlanService.deletePersonal(
      ownerVersionScope({ organizationId, ownerUserId, version }),
      id,
    );
    return { success: removed };
  }
}
