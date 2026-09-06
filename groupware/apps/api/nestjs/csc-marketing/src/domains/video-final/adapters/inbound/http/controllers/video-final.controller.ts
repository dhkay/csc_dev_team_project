import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
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
  orgVersionScope,
  workspaceScope,
} from '../../../../../../shared/domain/workspace-scope';
import {
  VideoFinalPort,
  VIDEO_FINAL_PORT,
} from '../../../../core/application/ports/inbound';
import {
  CreateVideoFinalDto,
  MoveVideoFinalDto,
  RerenderVideoFinalDto,
  UnarchiveVideoFinalDto,
} from '../dto';

/**
 * 최종 영상 API: 개인 워크스페이스 + 보관함(둘 다 작업자 × 채널 × 도구 버전)
 * organizationId/ownerUserId 는 신뢰된 호출자(web-groupware BFF)가 세션에서 도출해 전달한다.
 * (ServiceTokenGuard 로 호출자 인증: 개인 격리는 BFF 신뢰 + ownerUserId 스코프)
 * 모든 쓰기가 소유(조직 + 작업자 + 버전)로 대상을 검증한다.
 *
 * 도구 버전은 경로 세그먼트다: 최종 영상은 버전 소유이고 v1.0 과 v1.5 는 별개 워크스페이스다.
 */
@ApiTags('[마케팅] 최종 영상(video-final) API')
@ApiParam({
  name: 'version',
  description: '도구 버전(v1.0 / v1.5). 최종 영상은 버전마다 별개 워크스페이스와 보관함에 담긴다.',
})
@Controller(`${TOOL_VERSION_ROUTE}/video-finals`)
export class VideoFinalController {
  constructor(
    @Inject(VIDEO_FINAL_PORT)
    private readonly videoFinalService: VideoFinalPort,
  ) {}

  @ApiOperation({
    summary: '[VIDEO-011] 최종 영상 만들기',
    description:
      '완성한 영상 프로젝트를 최종본으로 굳힌다. 최종본은 작업 중인 프로젝트와 달리 더 손대지 않는 결과물이라 ' +
      '보관함으로 보내 따로 모아 둘 수 있다. 만들기는 뒤에서 진행되며 응답은 접수 상태로 즉시 돌아온다. ' +
      'clientRequestId 를 함께 보내면 같은 값으로 다시 요청해도 새로 만들지 않고 먼저 접수된 것을 ' +
      '그대로 돌려준다. 접수됐는지 확실하지 않을 때 그대로 다시 보내도 중복으로 진행되지 않는다.',
  })
  @ApiResponse({ status: 404, description: '원본 프로젝트가 없거나 다른 작업자의 것이다.' })
  @Post()
  async createFromSource(
    @PathToolVersion() version: ToolVersion,
    @Body() dto: CreateVideoFinalDto,
  ) {
    const created = await this.videoFinalService.createFromSourcePersonal(
      ownerVersionScope({
        organizationId: dto.organizationId,
        ownerUserId: dto.ownerUserId,
        version,
      }),
      dto.sourceId,
      dto.setId,
      dto.clientRequestId ?? null,
    );
    if (!created) throw new NotFoundException('원천 영상을 찾을 수 없습니다.');
    return created;
  }

  @ApiOperation({
    summary: '[VIDEO-012] 내 최종 영상 목록',
    description:
      '그 작업자가 그 채널에서 만든 최종 영상을 최근 순으로 반환한다. 보관함으로 보낸 것은 여기 오지 않는다.',
  })
  @ApiQuery({ name: 'organizationId', description: '조직 id.' })
  @ApiQuery({ name: 'ownerUserId', description: '작업자(조직유저) id. 개인 작업 공간은 사람마다 분리되므로 남의 것은 조회되지 않는다.' })
  @ApiQuery({ name: 'channelId', description: '작업 공간과 보관함은 채널별로 분리된다. 필수이며 빠지면 400 이다.' })
  @Get()
  listPersonal(
    @PathToolVersion() version: ToolVersion,
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('ownerUserId', ParseIntPipe) ownerUserId: number,
    // 워크스페이스는 채널별로 분리된다. 필수 파라미터라 누락 시 400 으로 막는다.
    @Query('channelId', ParseIntPipe) channelId: number,
  ) {
    return this.videoFinalService.listPersonal(
      workspaceScope({ organizationId, ownerUserId, channelId, version }),
    );
  }

  /**
   * 보관함 목록
   * `@Get(':id')` 앞에 둬야 한다. 뒤에 두면 'archive' 가 id 로 잡혀 ParseIntPipe 400 이 된다.
   */
  @ApiOperation({
    summary: '[VIDEO-013] 보관함 목록',
    description:
      '조직의 보관함을 반환한다. 보관함은 조직이 함께 쓰는 공간이라 누가 만든 것이든 그 조직의 ' +
      '보관물이면 모두 들어온다(개인 작업 공간과 다르다). 채널로는 나뉘지 않는다. ' +
      '영상은 만들 때의 도구 버전에 속하므로, 경로에 적은 버전의 것만 목록에 들어온다. ' +
      '각 항목의 ownerUserId 가 만든 사람이다(화면이 이름으로 바꿔 표시한다).',
  })
  @ApiQuery({ name: 'organizationId', description: '조직 id.' })
  @Get('archive')
  listArchive(
    @PathToolVersion() version: ToolVersion,
    @Query('organizationId', ParseIntPipe) organizationId: number,
  ) {
    return this.videoFinalService.listArchive(orgVersionScope({ organizationId, version }));
  }

  @ApiOperation({
    summary: '[VIDEO-014] 최종 영상 조회',
    description:
      '최종 영상 하나의 상태와 결과를 반환한다. 만드는 중에는 상태만 바뀌므로 화면이 이 경로를 주기적으로 ' +
      '다시 불러 진행 상황을 확인한다.',
  })
  @ApiParam({ name: 'id', description: '조회할 최종 영상 id.' })
  @ApiQuery({ name: 'organizationId', description: '조직 id.' })
  @ApiQuery({ name: 'ownerUserId', description: '작업자(조직유저) id. 개인 작업 공간은 사람마다 분리되므로 남의 것은 조회되지 않는다.' })
  @ApiResponse({ status: 404, description: '그 영상이 없거나 다른 작업자의 것이다.' })
  @Get(':id')
  async getPersonal(
    @PathToolVersion() version: ToolVersion,
    @Param('id', ParseIntPipe) id: number,
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('ownerUserId', ParseIntPipe) ownerUserId: number,
  ) {
    const final = await this.videoFinalService.getPersonal(
      ownerVersionScope({ organizationId, ownerUserId, version }),
      id,
    );
    if (!final) throw new NotFoundException('최종 영상을 찾을 수 없습니다.');
    return final;
  }

  @ApiOperation({
    summary: '[VIDEO-015] 최종 영상 다시 만들기',
    description: '실패했거나 결과가 마음에 들지 않을 때 같은 내용으로 다시 만든다. 이전 결과는 대체된다.',
  })
  @ApiParam({ name: 'id', description: '다시 만들 최종 영상 id.' })
  @ApiResponse({ status: 404, description: '그 영상이 없거나 다른 작업자의 것이다.' })
  @Post(':id/render')
  async rerender(
    @PathToolVersion() version: ToolVersion,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RerenderVideoFinalDto,
  ) {
    const updated = await this.videoFinalService.rerenderPersonal(
      ownerVersionScope({
        organizationId: dto.organizationId,
        ownerUserId: dto.ownerUserId,
        version,
      }),
      id,
    );
    if (!updated) throw new NotFoundException('최종 영상을 찾을 수 없습니다.');
    return updated;
  }

  /** 워크스페이스 삭제: 내 개인 항목만. 보관물은 `:id/archived` 로 간다(권한 규칙이 다르다) */
  @ApiOperation({
    summary: '[VIDEO-016] 최종 영상 삭제',
    description:
      '내 작업 공간의 최종 영상을 지운다. 보관함에 있는 것은 이 경로로 지워지지 않는다(보관함 전용 경로를 ' +
      '쓴다). 없거나 남의 것이면 success 가 false 로 오며 오류가 아니다.',
  })
  @ApiParam({ name: 'id', description: '삭제할 최종 영상 id.' })
  @ApiQuery({ name: 'organizationId', description: '조직 id.' })
  @ApiQuery({ name: 'ownerUserId', description: '작업자(조직유저) id. 개인 작업 공간은 사람마다 분리되므로 남의 것은 조회되지 않는다.' })
  @Delete(':id')
  async deletePersonal(
    @PathToolVersion() version: ToolVersion,
    @Param('id', ParseIntPipe) id: number,
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('ownerUserId', ParseIntPipe) ownerUserId: number,
  ) {
    const removed = await this.videoFinalService.deletePersonal(
      ownerVersionScope({ organizationId, ownerUserId, version }),
      id,
    );
    return { success: removed };
  }

  /** 보관함 삭제: 만든 사람 또는 관리급(manageAll). 워크스페이스 삭제와 규칙이 다르다. */
  @ApiOperation({
    summary: '[VIDEO-017] 보관함에서 삭제',
    description:
      '보관함에 있는 영상을 지운다. 되돌릴 수 없다. 보관함은 조직이 함께 보지만 삭제는 만든 사람과 ' +
      '관리급(대표/팀장)에게만 열려 있다. manageAll 없이 남의 것을 지우려 하면 success 가 false 로 ' +
      '오며 오류가 아니다. 개인 작업 공간 항목은 이 경로로 지워지지 않는다.',
  })
  @ApiParam({ name: 'id', description: '삭제할 보관 영상 id.' })
  @ApiQuery({ name: 'organizationId', description: '조직 id.' })
  @ApiQuery({
    name: 'ownerUserId',
    description:
      '요청한 사람(조직유저) id. manageAll 이 아니면 이 사람이 만든 보관물만 지워지고, ' +
      'manageAll 이면 소유와 무관하게 지워진다. 어느 쪽이든 활동 로그의 행위자가 된다.',
  })
  @ApiQuery({
    name: 'manageAll',
    required: false,
    description:
      "'true' 면 소유와 무관하게 지운다. 요청자가 관리급(대표/팀장)인지 판정한 결과를 호출자가 " +
      '싣는다. 값이 없으면 소유자 경로로 동작한다(넓은 쪽이 기본값이 되지 않게).',
  })
  @Delete(':id/archived')
  async deleteArchived(
    @PathToolVersion() version: ToolVersion,
    @Param('id', ParseIntPipe) id: number,
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('ownerUserId', ParseIntPipe) ownerUserId: number,
    @Query('manageAll') manageAll?: string,
  ) {
    const removed = await this.videoFinalService.deleteArchived(
      ownerVersionScope({ organizationId, ownerUserId, version }),
      id,
      manageAll === 'true',
    );
    return { success: removed };
  }

  /** 보관함 보내기(개인 → 보관함). ownerUserId 로 소유를 검증하므로 본인 것만 옮길 수 있다. */
  @ApiOperation({
    summary: '[VIDEO-018] 보관함으로 보내기',
    description:
      '내 작업 공간의 최종 영상을 그 채널의 보관함으로 옮긴다. 옮기면 작업 공간 목록에서는 사라지고 ' +
      '보관함에서 보인다.',
  })
  @ApiParam({ name: 'id', description: '보관함으로 보낼 최종 영상 id.' })
  @ApiResponse({ status: 404, description: '그 영상이 없거나 다른 작업자의 것이다.' })
  @Post(':id/archive')
  async archive(
    @PathToolVersion() version: ToolVersion,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveVideoFinalDto,
  ) {
    const moved = await this.videoFinalService.archivePersonal(
      ownerVersionScope({
        organizationId: dto.organizationId,
        ownerUserId: dto.ownerUserId,
        version,
      }),
      id,
    );
    if (!moved) throw new NotFoundException('최종 영상을 찾을 수 없습니다.');
    return moved;
  }

  /** 보관함에서 꺼내기(보관함 → 꺼낸 사람의 워크스페이스) */
  @ApiOperation({
    summary: '[VIDEO-019] 보관함에서 꺼내기',
    description:
      '보관함의 영상을 요청한 사람의 작업 공간으로 옮긴다. 보관함이 조직 공용이라 다른 사람이 만든 ' +
      '것도 꺼낼 수 있고, 그때 소유와 채널이 꺼낸 사람 쪽으로 바뀐다(그러지 않으면 꺼낸 사람의 어느 ' +
      '목록에도 나타나지 않는다). 원본이 사라지는 동작이 아니라 위치가 바뀌는 동작이다.',
  })
  @ApiParam({ name: 'id', description: '꺼낼 보관 영상 id.' })
  @ApiResponse({ status: 404, description: '그 영상이 없거나 이미 보관함에 없다.' })
  @Post(':id/unarchive')
  async unarchive(
    @PathToolVersion() version: ToolVersion,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UnarchiveVideoFinalDto,
  ) {
    const moved = await this.videoFinalService.unarchive(
      workspaceScope({
        organizationId: dto.organizationId,
        ownerUserId: dto.ownerUserId,
        channelId: dto.channelId,
        version,
      }),
      id,
    );
    if (!moved) throw new NotFoundException('보관함에서 최종 영상을 찾을 수 없습니다.');
    return moved;
  }
}
