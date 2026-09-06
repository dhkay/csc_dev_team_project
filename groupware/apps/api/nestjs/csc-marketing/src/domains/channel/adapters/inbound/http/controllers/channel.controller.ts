import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChannelPort, CHANNEL_PORT } from '../../../../core/application/ports/inbound';
import {
  CreateChannelDto,
  UpdateChannelDto,
  ReorderChannelsDto,
} from '../dto';

/**
 * 채널 API: 조직이 공유하는 작업 맥락 CRUD.
 *
 * 같은 `channels` 접두사를 채널설정/기획서 생성 컨트롤러가 나눠 가진다. NestJS 는 전체
 * 경로로 매칭하므로 접두사가 같아도 충돌하지 않는다. 경로를 도메인마다 새로 만들지 않은 이유는
 * 그 모두가 채널 스코프의 자원이기 때문이다(BFF, 프론트, 문서가 그대로 유지된다)
 *
 * organizationId 는 신뢰된 호출자(web-groupware BFF)가 세션에서 도출해 전달한다.
 * (ServiceTokenGuard 로 호출자 인증: 조직 격리는 BFF 신뢰 + organizationId 스코프)
 */
@ApiTags('[마케팅] 채널(channel) API')
@Controller('channels')
export class ChannelController {
  constructor(
    @Inject(CHANNEL_PORT)
    private readonly channelService: ChannelPort,
  ) {}

  // 순서/대표: 정적 경로라 :id 라우트보다 먼저 선언

  @ApiOperation({
    summary: '[CHANNEL-001] 채널 표시 순서 변경',
    description:
      '자기 채널 목록의 표시 순서를 orderedIds 순서대로 다시 매긴다. 순서는 본인에게만 적용된다. ' +
      '자기 목록에 없는 id 나 중복은 무시하고, 빈 배열이면 아무것도 바꾸지 않는다.',
  })
  @ApiResponse({ status: 400, description: 'orderedIds 가 배열이 아니거나 필수 id 가 없다.' })
  @Put('order')
  async reorderChannels(@Body() dto: ReorderChannelsDto) {
    await this.channelService.reorderChannels(
      dto.organizationId,
      dto.ownerUserId,
      dto.orderedIds,
    );
    return { success: true };
  }


  @ApiOperation({
    summary: '[CHANNEL-015] 조직 채널 이름 목록',
    description:
      '조직에 있는 모든 채널의 id 와 이름, 주인 id 를 반환한다. 채널 안의 설정이나 기획서, 영상은 ' +
      '포함되지 않는다. 채널 목록(GET /channels)이 주인 것만 돌려주는 것과 달리 조직 전체를 훑으므로, ' +
      '남이 만든 채널의 id 를 이름으로 바꿔야 하는 조직 단위 화면에서 사용한다. ' +
      '채널 이름은 주인 안에서만 유일하다: 같은 이름이 여러 건 올 수 있고 주인 id 로 구분한다. ' +
      '채널이 없는 사람의 기본 채널을 만들지 않으므로, 도구에 들어온 적 없는 사람은 목록에 없다.',
  })
  @ApiQuery({ name: 'organizationId', description: '조회할 조직 id.' })
  @ApiResponse({ status: 400, description: 'organizationId 가 정수가 아니다.' })
  @Get('roster')
  listChannelRoster(
    @Query('organizationId', ParseIntPipe) organizationId: number,
  ) {
    return this.channelService.listChannelRoster(organizationId);
  }


  // 채널

  @ApiOperation({
    summary: '[CHANNEL-003] 채널 목록',
    description:
      '그 사람의 채널을 표시 순서대로 반환한다. 채널은 사람마다 따로 가지므로 남의 채널은 오지 않는다. ' +
      '채널이 하나도 없으면 기본 채널("기본")을 만들어 그것을 반환하므로 빈 배열이 오지 않는다. ' +
      '그 안의 설정과 기획서, 영상이 이 채널에 속한다.',
  })
  @ApiQuery({ name: 'organizationId', description: '조회할 조직 id.' })
  @ApiQuery({ name: 'ownerUserId', description: '채널 주인(조직유저) id. 남의 채널은 조회되지 않는다.' })
  @Get()
  listChannels(
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('ownerUserId', ParseIntPipe) ownerUserId: number,
  ) {
    return this.channelService.listChannels(organizationId, ownerUserId);
  }

  @ApiOperation({
    summary: '[CHANNEL-004] 채널 생성',
    description:
      '자기 채널을 새로 만든다. 채널은 작업 맥락의 단위이며(블로그, 유튜브 등 본인이 정한다) ' +
      '그 안의 설정과 기획서, 영상이 모두 이 채널에 속한다. 이름은 본인 채널 안에서만 유일해야 한다.',
  })
  @ApiResponse({ status: 409, description: '자기 채널 중에 같은 이름이 이미 있다.' })
  @Post()
  createChannel(@Body() dto: CreateChannelDto) {
    return this.channelService.createChannel(dto.organizationId, dto.ownerUserId, dto.name);
  }

  @ApiOperation({
    summary: '[CHANNEL-005] 채널 이름 변경',
    description:
      '채널 이름만 바꾼다. 채널 id 는 바뀌지 않으므로 그 안의 설정과 기획서, 영상은 그대로 유지된다. ' +
      '자동 생성된 기본 채널도 이 경로로 이름을 바꾼다.',
  })
  @ApiParam({ name: 'id', description: '이름을 바꿀 채널 id.' })
  @ApiResponse({ status: 404, description: '그 사람에게 그 채널이 없다(남의 채널도 여기에 해당한다).' })
  @ApiResponse({ status: 409, description: '자기 다른 채널이 이미 그 이름을 쓴다.' })
  @Patch(':id')
  updateChannel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.channelService.updateChannel(
      dto.organizationId,
      dto.ownerUserId,
      id,
      dto.name,
    );
  }

  @ApiOperation({
    summary: '[CHANNEL-006] 채널 삭제',
    description:
      '채널과 그 안의 설정을 함께 지운다. 이미 없는 채널이면(남의 채널도 마찬가지) success 가 false 로 ' +
      '오며 오류가 아니다. 되돌릴 수 없다. **남은 채널이 하나뿐이면 400 이다**: 채널이 최소 하나는 ' +
      '있어야 하므로, 이름을 바꾸거나 새 채널을 먼저 만들어야 한다.',
  })
  @ApiParam({ name: 'id', description: '삭제할 채널 id.' })
  @ApiQuery({ name: 'organizationId', description: '채널이 속한 조직 id.' })
  @ApiQuery({ name: 'ownerUserId', description: '채널 주인(조직유저) id.' })
  @ApiResponse({ status: 400, description: '마지막 채널은 삭제할 수 없다.' })
  @Delete(':id')
  async deleteChannel(
    @Param('id', ParseIntPipe) id: number,
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('ownerUserId', ParseIntPipe) ownerUserId: number,
  ) {
    const removed = await this.channelService.deleteChannel(organizationId, ownerUserId, id);
    return { success: removed };
  }
}
