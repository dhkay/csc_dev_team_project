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
  orgVersionScope,
  ownerVersionScope,
  workspaceScope,
} from '../../../../../../shared/domain/workspace-scope';
import {
  VideoProjectPort,
  VIDEO_PROJECT_PORT,
} from '../../../../core/application/ports/inbound';
import {
  CreatePreviewVideoProjectDto,
  CreateVideoProjectDto,
  MoveVideoProjectDto,
  RerenderVideoProjectDto,
  RerenderVideoProjectSegmentDto,
  PlaceVideoProjectDto,
  UnarchiveVideoProjectDto,
} from '../dto';

/**
 * 영상 프로젝트 API: 개인 워크스페이스(작업자 x 채널 x 도구 버전)
 * organizationId 와 ownerUserId 는 BFF 가 세션에서 도출해 전달하고 도구 버전은 경로 세그먼트
 */
@ApiTags('[마케팅] 영상 프로젝트(video-project) API')
@ApiParam({
  name: 'version',
  description: '도구 버전(v1.0 / v1.5). 원천 영상은 버전마다 별개 워크스페이스에 담긴다.',
})
@Controller(`${TOOL_VERSION_ROUTE}/video-projects`)
export class VideoProjectController {
  constructor(
    @Inject(VIDEO_PROJECT_PORT)
    private readonly videoProjectService: VideoProjectPort,
  ) {}

  @ApiOperation({
    summary: '[VIDEO-006] 저장본으로 영상 프로젝트 만들기',
    description:
      '저장된 기획안을 영상으로 만들기 시작한다. 저장본의 씬과 이미지, 배경음악을 그 시점 그대로 복사해 ' +
      '두므로 이후 저장본을 고쳐도 진행 중인 영상에는 영향이 없다. ' +
      '만들기는 뒤에서 진행되며 응답은 접수 상태로 즉시 돌아온다. 진행 상황은 프로젝트 조회로 확인한다. ' +
      'clientRequestId 를 함께 보내면 같은 값으로 다시 요청해도 새로 만들지 않고 먼저 접수된 것을 ' +
      '그대로 돌려준다. 접수됐는지 확실하지 않을 때 그대로 다시 보내도 중복으로 진행되지 않는다.',
  })
  @ApiResponse({ status: 404, description: '그 저장본이 없거나 다른 작업자의 것이다.' })
  @Post()
  async createFromSavedPlan(
    @PathToolVersion() version: ToolVersion,
    @Body() dto: CreateVideoProjectDto,
  ) {
    const created = await this.videoProjectService.createFromSavedPlanPersonal(
      ownerVersionScope({
        organizationId: dto.organizationId,
        ownerUserId: dto.ownerUserId,
        version,
      }),
      dto.savedPlanId,
      dto.resolution,
      dto.clientRequestId ?? null,
    );
    if (!created) throw new NotFoundException('저장본을 찾을 수 없습니다.');
    return created;
  }

  /**
   * 미리보기 산출물 만들기. `@Get(':id')` 보다 위에 있을 필요는 없지만(POST 라 겹치지 않는다)
   * 생성 경로들과 나란히 읽히도록 목록 앞에 둔다.
   */
  @ApiOperation({
    summary: '[VIDEO-027] 미리보기 산출물 만들기(개발 환경 전용)',
    description:
      '만들기 과정을 실제로 돌리지 않고, 이미 만들어진 영상으로 완성 상태의 영상을 바로 등록한다. ' +
      '개발 환경에서 만들기 이후의 화면과 동작(목록, 보관함, 삭제)을 모델 호출 비용 없이 확인하기 ' +
      '위한 경로다. 운영 환경에서는 존재하지 않는다(404).\n\n' +
      '등록된 영상은 일반 영상과 구별되지 않는다. 다른 점은 만들기 작업 id 가 없다는 것뿐이며, ' +
      '그래서 이후 동작이 실제 영상과 똑같이 진행된다. 등록과 동시에 작업 공간에 배치된다.\n\n' +
      'resultUploadId 와 thumbnailUploadId 는 업로드 주소를 받아 파일 전송까지 마친 뒤의 값이다. ' +
      '이 경로가 그 파일들을 사용 확정 처리하며, 확정에 실패하면 등록도 취소된다.',
  })
  @ApiResponse({ status: 400, description: '요청 값이 유효하지 않거나 결과 파일을 확정할 수 없다.' })
  @ApiResponse({ status: 404, description: '운영 환경이라 이 경로가 없다.' })
  @Post('preview')
  createPreview(
    @PathToolVersion() version: ToolVersion,
    @Body() dto: CreatePreviewVideoProjectDto,
  ) {
    // 운영에서는 없는 경로로 답한다(403 이 아니다): 렌더 없이 완성본을 만드는 기능은 제품에
    //   쓸 데가 없고, 막혔다고 알리는 것 자체가 그 기능의 존재를 광고한다.
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException('Cannot POST');
    }
    return this.videoProjectService.createPreviewPersonal(
      ownerVersionScope({
        organizationId: dto.organizationId,
        ownerUserId: dto.ownerUserId,
        version,
      }),
      {
        channelId: dto.channelId,
        title: dto.title,
        videoModel: dto.videoModel ?? '',
        resultUploadId: dto.resultUploadId,
        thumbnailUploadId: dto.thumbnailUploadId ?? null,
        clientRequestId: dto.clientRequestId ?? null,
      },
    );
  }

  @ApiOperation({
    summary: '[VIDEO-007] 영상 프로젝트 목록',
    description: '그 작업자가 그 채널에서 만든 영상 프로젝트를 최근 순으로 반환한다.',
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
    return this.videoProjectService.listPersonal(
      workspaceScope({ organizationId, ownerUserId, channelId, version }),
    );
  }

  /**
   * 보관함 목록
   * `@Get(':id')` 앞에 둬야 한다. 뒤에 두면 'archive' 가 id 로 잡혀 ParseIntPipe 400 이 된다.
   */
  @ApiOperation({
    summary: '[VIDEO-023] 영상 보관함 목록',
    description:
      '조직의 영상 보관함을 반환한다. 보관함은 조직이 함께 쓰는 공간이라 누가 만든 것이든 그 조직의 ' +
      '보관물이면 모두 들어온다(개인 작업 공간과 다르다). 채널로는 나뉘지 않는다. ' +
      '영상은 만들 때의 도구 버전에 속하므로, 경로에 적은 버전의 것만 목록에 들어온다. ' +
      '각 항목의 ownerUserId 가 만든 사람이다(화면이 이름으로 바꿔 표시한다). ' +
      '원천과 최종을 나누는 도구 버전에서는 이 경로가 아니라 최종 영상 보관함이 배포본을 담는다.',
  })
  @ApiQuery({ name: 'organizationId', description: '조직 id.' })
  @Get('archive')
  listArchive(
    @PathToolVersion() version: ToolVersion,
    @Query('organizationId', ParseIntPipe) organizationId: number,
  ) {
    return this.videoProjectService.listArchive(orgVersionScope({ organizationId, version }));
  }

  @ApiOperation({
    summary: '[VIDEO-008] 영상 프로젝트 조회',
    description:
      '프로젝트 하나의 현재 상태와 결과를 반환한다. 만드는 중에는 상태만 바뀌므로 화면이 이 경로를 ' +
      '주기적으로 다시 불러 진행 상황을 확인한다. 완료되면 결과 영상 정보가 채워진다.',
  })
  @ApiParam({ name: 'id', description: '조회할 영상 프로젝트 id.' })
  @ApiQuery({ name: 'organizationId', description: '조직 id.' })
  @ApiQuery({ name: 'ownerUserId', description: '작업자(조직유저) id. 워크스페이스는 사람마다 분리되므로 남의 것은 조회되지 않는다.' })
  @ApiResponse({ status: 404, description: '그 프로젝트가 없거나 다른 작업자의 것이다.' })
  @Get(':id')
  async getPersonal(
    @PathToolVersion() version: ToolVersion,
    @Param('id', ParseIntPipe) id: number,
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('ownerUserId', ParseIntPipe) ownerUserId: number,
  ) {
    const project = await this.videoProjectService.getPersonal(
      ownerVersionScope({ organizationId, ownerUserId, version }),
      id,
    );
    if (!project) throw new NotFoundException('영상 프로젝트를 찾을 수 없습니다.');
    return project;
  }

  @ApiOperation({
    summary: '[VIDEO-022] 작업 공간에 배치',
    description:
      '만들어진 영상을 그 작업자의 작업 공간에 놓는다. 만드는 과정을 창에서 지켜본 뒤 마지막에 한 번 ' +
      '수행하는 동작이고, 이 단계를 쓰는 도구 버전에서는 **배치된 영상만** 작업 공간 목록에 나온다. ' +
      'thumbnailUploadId 를 함께 보내면 그 그림이 이 영상의 대표 이미지가 된다(이미 있으면 갈아 끼우고 ' +
      '이전 그림은 지운다). 여러 번 보내도 결과는 같으며 처음 배치한 시각이 유지된다.',
  })
  @ApiParam({ name: 'id', description: '배치할 영상 프로젝트 id.' })
  @ApiResponse({ status: 400, description: '아직 완성되지 않은 영상이다.' })
  @ApiResponse({ status: 404, description: '그 프로젝트가 없거나 다른 작업자의 것이다.' })
  @Post(':id/place')
  async place(
    @PathToolVersion() version: ToolVersion,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PlaceVideoProjectDto,
  ) {
    const placed = await this.videoProjectService.placeInWorkspacePersonal(
      ownerVersionScope({
        organizationId: dto.organizationId,
        ownerUserId: dto.ownerUserId,
        version,
      }),
      id,
      dto.thumbnailUploadId ?? null,
    );
    if (!placed) throw new NotFoundException('영상 프로젝트를 찾을 수 없습니다.');
    return placed;
  }

  @ApiOperation({
    summary: '[VIDEO-009] 영상 다시 만들기',
    description:
      '실패했거나 결과가 마음에 들지 않을 때 같은 내용으로 다시 만든다. 복사해 둔 씬과 이미지를 그대로 ' +
      '쓰므로 기획안을 다시 저장할 필요는 없다. 이전 결과는 대체된다.',
  })
  @ApiParam({ name: 'id', description: '다시 만들 영상 프로젝트 id.' })
  @ApiResponse({ status: 404, description: '그 프로젝트가 없거나 다른 작업자의 것이다.' })
  @Post(':id/render')
  async rerender(
    @PathToolVersion() version: ToolVersion,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RerenderVideoProjectDto,
  ) {
    const updated = await this.videoProjectService.rerenderPersonal(
      ownerVersionScope({
        organizationId: dto.organizationId,
        ownerUserId: dto.ownerUserId,
        version,
      }),
      id,
    );
    if (!updated) throw new NotFoundException('영상 프로젝트를 찾을 수 없습니다.');
    return updated;
  }

  @ApiOperation({
    summary: '[VIDEO-021] 세그먼트 다시 만들기',
    description:
      '영상을 이루는 세그먼트(장면) 하나만 다시 만든다. 나머지 세그먼트는 이미 만든 것을 그대로 쓰므로 ' +
      '벤더 비용은 그 하나에만 발생한다. `visualPrompt` 를 주면 그 세그먼트의 화면 묘사를 바꾼 뒤 만들고, ' +
      '주지 않으면 원래 묘사로 한 번 더 만든다(같은 묘사라도 결과는 매번 다르다).\n\n' +
      '프로젝트는 다시 만드는 중 상태로 돌아가고 이전 결과 영상은 비워진다. 전체 영상은 새로 만든 ' +
      '세그먼트를 포함해 처음부터 이어붙여지므로, 완료될 때까지 결과 영상은 조회되지 않는다. 진행 상황은 ' +
      '영상 프로젝트 조회로 확인한다.\n\n' +
      '아직 한 번도 만들어진 적 없는 프로젝트에는 사용할 수 없다(영상 다시 만들기를 쓴다).',
  })
  @ApiParam({ name: 'id', description: '영상 프로젝트 id.' })
  @ApiParam({
    name: 'order',
    description: '다시 만들 세그먼트의 순번. 영상 프로젝트 조회 응답의 segments[].order 값이다.',
  })
  @ApiResponse({ status: 400, description: '아직 만들어진 영상이 없어 세그먼트를 다시 만들 수 없다.' })
  @ApiResponse({ status: 404, description: '그 프로젝트가 없거나 다른 작업자의 것이다.' })
  @Post(':id/segments/:order/render')
  async rerenderSegment(
    @PathToolVersion() version: ToolVersion,
    @Param('id', ParseIntPipe) id: number,
    @Param('order', ParseIntPipe) order: number,
    @Body() dto: RerenderVideoProjectSegmentDto,
  ) {
    const updated = await this.videoProjectService.rerenderSegmentPersonal(
      ownerVersionScope({
        organizationId: dto.organizationId,
        ownerUserId: dto.ownerUserId,
        version,
      }),
      id,
      order,
      dto.visualPrompt ?? null,
    );
    if (!updated) throw new NotFoundException('영상 프로젝트를 찾을 수 없습니다.');
    return updated;
  }

  /** 보관함 보내기(개인 → 보관함). ownerUserId 로 소유를 검증하므로 본인 것만 옮길 수 있다. */
  @ApiOperation({
    summary: '[VIDEO-024] 영상 보관함으로 보내기',
    description:
      '내 작업 공간의 영상을 조직 보관함으로 옮긴다. 옮기면 작업 공간 목록에서는 사라지고 보관함에서 ' +
      '보인다. 완성되고 작업 공간에 배치된 영상만 보낼 수 있다.',
  })
  @ApiParam({ name: 'id', description: '보관함으로 보낼 영상 id.' })
  @ApiResponse({ status: 400, description: '아직 완성되지 않았거나 작업 공간에 배치되지 않은 영상이다.' })
  @ApiResponse({ status: 404, description: '그 영상이 없거나 다른 작업자의 것이다.' })
  @Post(':id/archive')
  async archive(
    @PathToolVersion() version: ToolVersion,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveVideoProjectDto,
  ) {
    const moved = await this.videoProjectService.archivePersonal(
      ownerVersionScope({
        organizationId: dto.organizationId,
        ownerUserId: dto.ownerUserId,
        version,
      }),
      id,
    );
    if (!moved) throw new NotFoundException('영상을 찾을 수 없습니다.');
    return moved;
  }

  /** 보관함에서 꺼내기(보관함 → 꺼낸 사람의 작업 공간) */
  @ApiOperation({
    summary: '[VIDEO-025] 영상 보관함에서 꺼내기',
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
    @Body() dto: UnarchiveVideoProjectDto,
  ) {
    const moved = await this.videoProjectService.unarchive(
      workspaceScope({
        organizationId: dto.organizationId,
        ownerUserId: dto.ownerUserId,
        channelId: dto.channelId,
        version,
      }),
      id,
    );
    if (!moved) throw new NotFoundException('보관함에서 영상을 찾을 수 없습니다.');
    return moved;
  }

  /**
   * 보관물 삭제. `@Delete(':id')` 앞에 둘 필요는 없지만(경로가 더 길어 겹치지 않는다) 개인 삭제와
   * 나란히 읽히도록 함께 둔다. 권한 규칙이 다르다는 것이 이 두 경로가 갈린 이유다.
   */
  @ApiOperation({
    summary: '[VIDEO-026] 영상 보관함에서 삭제',
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
    const removed = await this.videoProjectService.deleteArchived(
      ownerVersionScope({ organizationId, ownerUserId, version }),
      id,
      manageAll === 'true',
    );
    return { success: removed };
  }

  @ApiOperation({
    summary: '[VIDEO-010] 영상 프로젝트 삭제',
    description:
      '프로젝트와 그 결과물을 지운다. 없거나 남의 것이면 success 가 false 로 오며 오류가 아니다. ' +
      '되돌릴 수 없다.',
  })
  @ApiParam({ name: 'id', description: '삭제할 영상 프로젝트 id.' })
  @ApiQuery({ name: 'organizationId', description: '조직 id.' })
  @ApiQuery({ name: 'ownerUserId', description: '작업자(조직유저) id. 워크스페이스는 사람마다 분리되므로 남의 것은 조회되지 않는다.' })
  @Delete(':id')
  async deletePersonal(
    @PathToolVersion() version: ToolVersion,
    @Param('id', ParseIntPipe) id: number,
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('ownerUserId', ParseIntPipe) ownerUserId: number,
  ) {
    const removed = await this.videoProjectService.deletePersonal(
      ownerVersionScope({ organizationId, ownerUserId, version }),
      id,
    );
    return { success: removed };
  }
}
