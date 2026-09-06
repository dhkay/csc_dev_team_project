import { Body, Controller, Get, Inject, ParseIntPipe, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  ChannelSettingsPort,
  CHANNEL_SETTINGS_PORT,
} from '../../../../core/application/ports/inbound';
import { SetDefaultChannelDto, SetEntryVersionDto } from '../dto';

/**
 * 진입 취향 API: 도구 재진입 시 갈 곳. 버전 슬롯이 아니라 개인 취향이라 경로에 버전을 받지 않음
 * 둘 다 낡아도 안전(없는 채널은 첫 채널로, 모르는 버전은 기본 버전으로 접음)
 */
@ApiTags('[마케팅] 개인 도구 설정(user-settings) API')
@Controller('user-settings')
export class EntryPreferencesController {
  constructor(
    @Inject(CHANNEL_SETTINGS_PORT)
    private readonly settingsService: ChannelSettingsPort,
  ) {}

  @ApiOperation({
    summary: '[PREF-003] 진입 도구 버전 조회',
    description:
      '이 사람이 도구에 다시 들어왔을 때 열릴 버전을 반환한다. 한 번도 바꾼 적이 없으면 기본 버전이 ' +
      '온다. **지금 보고 있는 버전이 아니다**: 그것은 요청 경로가 말한다.',
  })
  @ApiQuery({ name: 'organizationId', description: '조회 대상이 속한 조직 id.' })
  @ApiQuery({ name: 'ownerUserId', description: '조회 대상(조직유저) id.' })
  @Get('entry-version')
  async getEntryVersion(
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('ownerUserId', ParseIntPipe) ownerUserId: number,
  ) {
    return { version: await this.settingsService.getEntryVersion(organizationId, ownerUserId) };
  }

  @ApiOperation({
    summary: '[PREF-004] 진입 도구 버전 지정',
    description:
      '다음에 도구를 열 때 갈 버전을 정한다. 버전마다 설정과 산출물이 따로 남으므로, 되돌아오면 그 ' +
      '버전에서 하던 작업이 그대로 있다. 알 수 없는 값을 보내면 기본 버전으로 확정되며 응답의 ' +
      'version 이 확정된 값이다.',
  })
  @Put('entry-version')
  async setEntryVersion(@Body() dto: SetEntryVersionDto) {
    return {
      version: await this.settingsService.setEntryVersion(
        dto.organizationId,
        dto.ownerUserId,
        dto.version,
      ),
    };
  }

  @ApiOperation({
    summary: '[PREF-005] 진입 채널 조회',
    description:
      '이 사람이 도구에 들어왔을 때 먼저 열릴 채널 id 를 반환한다. 고른 적이 없으면 null 이며, ' +
      '그때는 부르는 쪽이 채널 목록의 첫 채널을 연다. 지정한 채널이 그 뒤 삭제됐어도 값은 남아 있으므로 ' +
      '목록에 있는지 확인해 쓴다.',
  })
  @ApiQuery({ name: 'organizationId', description: '조회 대상이 속한 조직 id.' })
  @ApiQuery({ name: 'ownerUserId', description: '조회 대상(조직유저) id.' })
  @Get('default-channel')
  async getDefaultChannel(
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('ownerUserId', ParseIntPipe) ownerUserId: number,
  ) {
    return {
      channelId: await this.settingsService.getDefaultChannelId(organizationId, ownerUserId),
    };
  }

  @ApiOperation({
    summary: '[PREF-006] 진입 채널 지정',
    description:
      '도구에 들어왔을 때 먼저 열릴 채널을 정한다. **본인에게만 적용된다**: 같은 조직의 다른 사람이 ' +
      '보는 첫 화면은 바뀌지 않는다. null 을 보내면 지정을 해제하고 첫 채널로 돌아간다.',
  })
  @Put('default-channel')
  async setDefaultChannel(@Body() dto: SetDefaultChannelDto) {
    return {
      channelId: await this.settingsService.setDefaultChannelId(
        dto.organizationId,
        dto.ownerUserId,
        dto.channelId ?? null,
      ),
    };
  }
}
