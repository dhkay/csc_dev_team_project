import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ChannelSettingsPort,
  CHANNEL_SETTINGS_PORT,
} from '../../../../core/application/ports/inbound';

/**
 * 브랜드/컨셉 선택지 카탈로그. 목록의 주인은 프롬프트를 쓰는 이 서버
 * 채널 스코프가 아니라 /channels 아래 두지 않음(:channelId 와의 세그먼트 충돌 회피)
 */
@ApiTags('[마케팅] 브랜드/컨셉 카탈로그(brand-concept-catalog) API')
@Controller('brand-concept-catalog')
export class BrandConceptCatalogController {
  constructor(
    @Inject(CHANNEL_SETTINGS_PORT)
    private readonly settingsService: ChannelSettingsPort,
  ) {}

  @ApiOperation({
    summary: '[CHANNEL-014] 브랜드/컨셉 선택지 목록',
    description:
      '영상의 연출 방향을 고를 때 쓰는 기본 축과 각 축의 선택지를 반환한다. 축은 표현 형식, 무드, ' +
      '톤앤매너, 사운드 스타일, 콘텐츠 구조, 타겟 오디언스, 목적 유형이다. ' +
      '선택지의 이름과 감독 노트는 화면에 그대로 보이고, 기획서와 씬 이미지를 만들 때 프롬프트에도 ' +
      '그대로 실린다. 저장할 값은 이 응답의 축 key 와 옵션 key 로 지정한다. ' +
      '이 목록은 모든 사용자에게 같고 바뀌지 않는다. 여기 없는 축과 선택지를 쓰려면 브랜드/컨셉 ' +
      '세트에 직접 정의한다(/user-settings/brand-concept 의 customAxes, customOptions). 그렇게 더한 ' +
      '것은 그 세트에만 나타나므로 이 응답에는 포함되지 않는다.',
  })
  @Get()
  getBrandConceptCatalog() {
    return this.settingsService.getBrandConceptCatalog();
  }
}
