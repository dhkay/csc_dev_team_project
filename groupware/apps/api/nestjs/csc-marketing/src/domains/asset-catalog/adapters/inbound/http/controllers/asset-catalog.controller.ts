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
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AssetCatalogPort, ASSET_CATALOG_PORT } from '../../../../core/application/ports/inbound';
import { parseOwner } from '../../../../../../shared/domain/scoped-ownership';
import { CreateAxisDto, CreateTagDto } from '../dto';

/**
 * 태그 카탈로그 API: 축/태그 조회 + CRUD. owner(organizationId 쿼리 유무)로 스코프
 *   organizationId 없음 = 플랫폼(common) / 있음 = 조직(common ∪ 자기 org 조회, 자기 org 만 편집)
 * 인가(누가 owner 인지)는 BFF 에서. ServiceTokenGuard 로 호출자 인증
 */
@ApiTags('[마케팅] 태그 카탈로그(asset-catalog) API')
@Controller('asset-catalog')
export class AssetCatalogController {
  constructor(
    @Inject(ASSET_CATALOG_PORT)
    private readonly service: AssetCatalogPort,
  ) {}

  @ApiOperation({
    summary: '[CATALOG-003] 태그 축과 값 목록',
    description:
      '에셋에 붙일 수 있는 태그를 축(분위기, 템포 등)별로 묶어 반환한다. 배경음악이나 효과음을 고를 때 ' +
      '이 태그로 걸러 내고, 기획 단계에서 모델이 후보를 고르는 근거로도 쓰인다.',
  })
  @ApiQuery({ name: 'category', required: false, description: '에셋 종류로 좁힌다. 생략하면 전부.' })
  @ApiQuery({ name: 'organizationId', required: false, description: '주면 그 조직의 것, 생략하면 플랫폼 공통이다. 조회는 공통과 자기 조직을 함께 보고, 편집은 자기 것만 된다.' })
  @Get('axes')
  listAxes(@Query('category') category?: string, @Query('organizationId') organizationId?: string) {
    return this.service.listAxesWithTags(parseOwner(organizationId), category);
  }

  @ApiOperation({
    summary: '[CATALOG-004] 태그 축 추가',
    description: '태그를 묶는 축을 하나 만든다. 축 아래에 값을 붙여 쓴다.',
  })
  @Post('axes')
  createAxis(@Body() dto: CreateAxisDto, @Query('organizationId') organizationId?: string) {
    return this.service.createAxis(dto, parseOwner(organizationId));
  }

  @ApiOperation({
    summary: '[CATALOG-005] 태그 축 삭제',
    description:
      '축과 그 축의 값들을 지운다. 자기 것만 지울 수 있다(공통 축은 조직이 지울 수 없다). ' +
      '없거나 남의 것이면 success 가 false 로 오며 오류가 아니다.',
  })
  @ApiParam({ name: 'id', description: '삭제할 축 id.' })
  @ApiQuery({ name: 'organizationId', required: false, description: '주면 그 조직의 것, 생략하면 플랫폼 공통이다. 조회는 공통과 자기 조직을 함께 보고, 편집은 자기 것만 된다.' })
  @Delete('axes/:id')
  async deleteAxis(
    @Param('id', ParseIntPipe) id: number,
    @Query('organizationId') organizationId?: string,
  ) {
    return { success: await this.service.deleteAxis(id, parseOwner(organizationId)) };
  }

  @ApiOperation({
    summary: '[CATALOG-006] 태그 값 추가',
    description: '축 아래에 고를 수 있는 값을 하나 더한다.',
  })
  @Post('tags')
  async createTag(@Body() dto: CreateTagDto, @Query('organizationId') organizationId?: string) {
    const created = await this.service.createTag(dto, parseOwner(organizationId));
    if (!created) throw new NotFoundException('축을 찾을 수 없거나 접근할 수 없습니다.');
    return created;
  }

  @ApiOperation({
    summary: '[CATALOG-007] 태그 값 삭제',
    description:
      '값을 지운다. 그 값을 쓰던 에셋에서는 태그만 떨어지고 에셋 자체는 남는다. ' +
      '없거나 남의 것이면 success 가 false 로 오며 오류가 아니다.',
  })
  @ApiParam({ name: 'id', description: '삭제할 태그 값 id.' })
  @ApiQuery({ name: 'organizationId', required: false, description: '주면 그 조직의 것, 생략하면 플랫폼 공통이다. 조회는 공통과 자기 조직을 함께 보고, 편집은 자기 것만 된다.' })
  @Delete('tags/:id')
  async deleteTag(
    @Param('id', ParseIntPipe) id: number,
    @Query('organizationId') organizationId?: string,
  ) {
    return { success: await this.service.deleteTag(id, parseOwner(organizationId)) };
  }
}
