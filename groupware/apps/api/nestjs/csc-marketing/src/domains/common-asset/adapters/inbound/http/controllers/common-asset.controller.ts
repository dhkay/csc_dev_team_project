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
import { CommonAssetPort, COMMON_ASSET_PORT } from '../../../../core/application/ports/inbound';
import { parseOwner } from '../../../../../../shared/domain/scoped-ownership';
import { CreateCommonAssetDto, UpdateCommonAssetDto } from '../dto';

/**
 * 공통 에셋 API: 플랫폼(scope='common') + 조직(scope='organization') 마케팅영상 공통 에셋(풀)
 * 소유자는 organizationId 유무로 판별: 없으면 플랫폼(control-tower), 있으면 조직(groupware BFF 주입)
 * 인가는 BFF 에서(플랫폼=ai-tools-management / 조직=ROOT, 대표, 팀장). ServiceTokenGuard 로 호출자 인증
 */
@ApiTags('[마케팅] 공통 에셋(common-assets) API')
@Controller('common-assets')
export class CommonAssetController {
  constructor(
    @Inject(COMMON_ASSET_PORT)
    private readonly commonAssetService: CommonAssetPort,
  ) {}

  @ApiOperation({
    summary: '[CATALOG-014] 공통 에셋 목록',
    description:
      '영상에 쓰는 배경음악, 효과음, 예시 이미지 등을 반환한다. 기획 단계에서 모델이 여기서 배경음악과 ' +
      '효과음을 고르므로, 태그를 잘 붙여 둘수록 어울리는 것이 선택된다.',
  })
  @ApiQuery({ name: 'organizationId', required: false, description: '주면 그 조직의 것, 생략하면 플랫폼 공통이다. 조회는 공통과 자기 조직을 함께 보고, 편집은 자기 것만 된다.' })
  @Get()
  list(@Query('organizationId') organizationId?: string) {
    return this.commonAssetService.list(parseOwner(organizationId));
  }

  @ApiOperation({
    summary: '[CATALOG-015] 공통 에셋 등록',
    description: '업로드한 파일을 종류와 태그를 붙여 풀에 넣는다.',
  })
  @Post()
  createOne(@Body() dto: CreateCommonAssetDto) {
    return this.commonAssetService.createOne({
      category: dto.category,
      organizationId: dto.organizationId,
      uploadId: dto.uploadId,
      name: dto.name,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      tagIds: dto.tagIds,
      createdByAdminId: dto.createdByAdminId,
    });
  }

  @ApiOperation({
    summary: '[CATALOG-016] 공통 에셋 수정',
    description: '이름과 태그를 바꾼다. 파일 자체는 교체되지 않는다.',
  })
  @ApiParam({ name: 'id', description: '수정할 에셋 id.' })
  @ApiQuery({ name: 'organizationId', required: false, description: '주면 그 조직의 것, 생략하면 플랫폼 공통이다. 조회는 공통과 자기 조직을 함께 보고, 편집은 자기 것만 된다.' })
  @ApiResponse({ status: 404, description: '그 에셋이 없거나 남의 것이다.' })
  @Patch(':id')
  async updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCommonAssetDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const updated = await this.commonAssetService.updateOneById(
      id,
      { name: dto.name, tagIds: dto.tagIds },
      parseOwner(organizationId),
    );
    if (!updated) throw new NotFoundException('공통 에셋을 찾을 수 없습니다.');
    return updated;
  }

  @ApiOperation({
    summary: '[CATALOG-017] 공통 에셋 삭제',
    description:
      '풀에서 뺀다. 이미 만들어진 영상에는 영향이 없다(만들 때 값을 복사해 두기 때문이다). ' +
      '없거나 남의 것이면 success 가 false 로 오며 오류가 아니다.',
  })
  @ApiParam({ name: 'id', description: '삭제할 에셋 id.' })
  @ApiQuery({ name: 'organizationId', required: false, description: '주면 그 조직의 것, 생략하면 플랫폼 공통이다. 조회는 공통과 자기 조직을 함께 보고, 편집은 자기 것만 된다.' })
  @Delete(':id')
  async deleteOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('organizationId') organizationId?: string,
  ) {
    const removed = await this.commonAssetService.deleteOneById(id, parseOwner(organizationId));
    return { success: removed };
  }
}
