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
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AssetSetPort, ASSET_SET_PORT } from '../../../../core/application/ports/inbound';
import { parseOwner } from '../../../../../../shared/domain/scoped-ownership';
import { CreateAssetSetDto, UpdateAssetSetDto, SetSlotDto } from '../dto';

/**
 * 에셋 세트 API: 플랫폼(common)/조직(organization) 자기완결 세트. 슬롯(frame/outro)에 업로드를 직접 지정
 * 소유자는 organizationId 유무로 판별(없으면 플랫폼, 있으면 조직 BFF 주입). 변경은 소유권 검증
 * 인가는 BFF 에서(플랫폼=ai-tools-management / 조직=ROOT, 대표, 팀장). ServiceTokenGuard 로 호출자 인증
 */
@ApiTags('[마케팅] 에셋 세트(asset-sets) API')
@Controller('asset-sets')
export class AssetSetController {
  constructor(
    @Inject(ASSET_SET_PORT)
    private readonly assetSetService: AssetSetPort,
  ) {}

  @ApiOperation({
    summary: '[CATALOG-008] 에셋 세트 목록',
    description:
      '영상의 앞뒤에 붙는 조각(프레임, 아웃트로)을 한 벌로 묶어 둔 세트를 반환한다. 세트를 고르면 그 조각들이 ' +
      '함께 적용되므로 영상마다 따로 지정하지 않아도 된다.',
  })
  @ApiQuery({ name: 'organizationId', required: false, description: '주면 그 조직의 것, 생략하면 플랫폼 공통이다. 조회는 공통과 자기 조직을 함께 보고, 편집은 자기 것만 된다.' })
  @Get()
  list(@Query('organizationId') organizationId?: string) {
    return this.assetSetService.list(parseOwner(organizationId));
  }

  @ApiOperation({
    summary: '[CATALOG-009] 에셋 세트 생성',
    description: '빈 세트를 만든다. 조각은 슬롯 지정으로 하나씩 채운다.',
  })
  @Post()
  createOne(@Body() dto: CreateAssetSetDto) {
    return this.assetSetService.createOne({
      name: dto.name,
      organizationId: dto.organizationId,
      createdByAdminId: dto.createdByAdminId,
      overlays: dto.overlays,
    });
  }

  @ApiOperation({
    summary: '[CATALOG-010] 에셋 세트 이름 변경',
    description: '세트 이름만 바꾼다. 채워 둔 조각은 그대로다.',
  })
  @ApiParam({ name: 'id', description: '이름을 바꿀 세트 id.' })
  @ApiQuery({ name: 'organizationId', required: false, description: '주면 그 조직의 것, 생략하면 플랫폼 공통이다. 조회는 공통과 자기 조직을 함께 보고, 편집은 자기 것만 된다.' })
  @ApiResponse({ status: 404, description: '그 세트가 없거나 남의 것이다.' })
  @Patch(':id')
  async updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssetSetDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const updated = await this.assetSetService.updateOneById(
      id,
      { name: dto.name, overlays: dto.overlays },
      parseOwner(organizationId),
    );
    if (!updated) throw new NotFoundException('세트를 찾을 수 없습니다.');
    return updated;
  }

  @ApiOperation({
    summary: '[CATALOG-011] 에셋 세트 삭제',
    description:
      '세트를 지운다. 세트에 지정해 둔 업로드 파일 자체는 지워지지 않는다. ' +
      '없거나 남의 것이면 success 가 false 로 오며 오류가 아니다.',
  })
  @ApiParam({ name: 'id', description: '삭제할 세트 id.' })
  @ApiQuery({ name: 'organizationId', required: false, description: '주면 그 조직의 것, 생략하면 플랫폼 공통이다. 조회는 공통과 자기 조직을 함께 보고, 편집은 자기 것만 된다.' })
  @Delete(':id')
  async deleteOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('organizationId') organizationId?: string,
  ) {
    const removed = await this.assetSetService.deleteOneById(id, parseOwner(organizationId));
    return { success: removed };
  }

  @ApiOperation({
    summary: '[CATALOG-012] 세트 슬롯 지정',
    description:
      '세트의 한 자리에 업로드한 파일을 걸어 둔다. 이미 걸려 있으면 교체된다.',
  })
  @ApiParam({ name: 'id', description: '세트 id.' })
  @ApiParam({ name: 'slot', description: '채울 자리(프레임, 아웃트로 등). 정해진 값 밖이면 400 이다.' })
  @ApiQuery({ name: 'organizationId', required: false, description: '주면 그 조직의 것, 생략하면 플랫폼 공통이다. 조회는 공통과 자기 조직을 함께 보고, 편집은 자기 것만 된다.' })
  @ApiResponse({ status: 400, description: '슬롯 이름이 정해진 값이 아니다.' })
  @ApiResponse({ status: 404, description: '그 세트가 없거나 남의 것이다.' })
  @Put(':id/slots/:slot')
  async setSlot(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot') slot: string,
    @Body() dto: SetSlotDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const updated = await this.assetSetService.setSlot(
      id,
      slot,
      dto.uploadId,
      parseOwner(organizationId),
    );
    if (!updated) throw new NotFoundException('세트를 찾을 수 없습니다.');
    return updated;
  }

  @ApiOperation({
    summary: '[CATALOG-013] 세트 슬롯 비우기',
    description: '그 자리를 비운다. 걸려 있던 업로드 파일 자체는 지워지지 않는다.',
  })
  @ApiParam({ name: 'id', description: '세트 id.' })
  @ApiParam({ name: 'slot', description: '비울 자리.' })
  @ApiQuery({ name: 'organizationId', required: false, description: '주면 그 조직의 것, 생략하면 플랫폼 공통이다. 조회는 공통과 자기 조직을 함께 보고, 편집은 자기 것만 된다.' })
  @ApiResponse({ status: 404, description: '그 세트가 없거나 남의 것이다.' })
  @Delete(':id/slots/:slot')
  async clearSlot(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot') slot: string,
    @Query('organizationId') organizationId?: string,
  ) {
    const updated = await this.assetSetService.clearSlot(
      id,
      slot,
      parseOwner(organizationId),
    );
    if (!updated) throw new NotFoundException('세트를 찾을 수 없습니다.');
    return updated;
  }
}
