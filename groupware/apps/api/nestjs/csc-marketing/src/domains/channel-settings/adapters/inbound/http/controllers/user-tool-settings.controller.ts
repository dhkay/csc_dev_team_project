import { Body, Controller, Get, Inject, ParseIntPipe, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  PathToolVersion,
  TOOL_VERSION_ROUTE,
} from '../../../../../../shared/adapters/inbound/http/tool-version.route';
import type { ToolVersion } from '../../../../../../shared/domain/tool-version';
import { ownerVersionScope } from '../../../../../../shared/domain/workspace-scope';
import {
  ChannelSettingsPort,
  CHANNEL_SETTINGS_PORT,
} from '../../../../core/application/ports/inbound';
import { SetAiModelDto, SetBrandConceptSetDetailDto, SetBrandConceptDto } from '../dto';

/**
 * 버전별 개인 설정 API. 스코프가 채널이 아니라 사람이라 경로가 `channels/...` 가 아님
 * 버전이 곧 저장 슬롯의 키라 경로에 위치. organizationId/ownerUserId 는 BFF 가 세션에서 도출해 전달
 */
@ApiTags('[마케팅] 개인 도구 설정(user-settings) API')
@ApiParam({
  name: 'version',
  description: '도구 버전(v1.0 / v1.5). 이 버전 슬롯의 설정만 읽고 쓴다.',
})
@Controller(`${TOOL_VERSION_ROUTE}/user-settings`)
export class UserToolSettingsController {
  constructor(
    @Inject(CHANNEL_SETTINGS_PORT)
    private readonly settingsService: ChannelSettingsPort,
  ) {}

  @ApiOperation({
    summary: '[PREF-001] 개인 AI 모델 선택 조회',
    description:
      '이 사람이 어떤 모델로 무엇을 만들지 반환한다. 기획서를 쓰는 모델, 씬 이미지를 그리는 모델, ' +
      '영상과 음성을 만드는 모델이 각각 따로다. 고르지 않은 항목은 빈 문자열이며, 그 상태에서는 해당 ' +
      '생성이 거부된다. 한 번도 고른 적이 없는 사람은 모든 항목이 빈 문자열로 온다.',
  })
  @ApiQuery({ name: 'organizationId', description: '조회 대상이 속한 조직 id.' })
  @ApiQuery({
    name: 'ownerUserId',
    description: '선택의 주인(조직유저) id. 모델 선택은 사람마다 분리되므로 남의 것은 조회되지 않는다.',
  })
  @Get('ai-model')
  getAiModel(
    @PathToolVersion() version: ToolVersion,
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('ownerUserId', ParseIntPipe) ownerUserId: number,
  ) {
    return this.settingsService.getAiModels(
      ownerVersionScope({ organizationId, ownerUserId, version }),
    );
  }

  @ApiOperation({
    summary: '[PREF-002] 개인 AI 모델 선택 저장',
    description:
      '보낸 선택으로 통째로 바꾼다. 모델 식별자는 화면이 목록에서 고른 값을 그대로 보관하므로, ' +
      '모델이 늘어도 서버 변경 없이 저장된다. 저장된 값은 그 사람의 다음 생성부터 적용되며 이미 만든 ' +
      '결과와 다른 사람의 선택에는 영향이 없다.',
  })
  @ApiResponse({ status: 400, description: '모델 식별자가 허용 길이를 넘었다.' })
  @Put('ai-model')
  setAiModel(@PathToolVersion() version: ToolVersion, @Body() dto: SetAiModelDto) {
    const scope = ownerVersionScope({
      organizationId: dto.organizationId,
      ownerUserId: dto.ownerUserId,
      version,
    });
    return this.settingsService.setAiModels(scope, {
      llm: dto.llm ?? '',
      video: dto.video ?? '',
      videoMode: dto.videoMode ?? '',
      tts: dto.tts ?? '',
      ttsVoice: dto.ttsVoice ?? '',
      ttsPitch: dto.ttsPitch ?? '',
      image: dto.image ?? '',
    });
  }

  @ApiOperation({
    summary: '[PREF-007] 개인 브랜드/컨셉 세트 조회',
    description:
      '이 사람이 등록한 브랜드와 그 브랜드의 연출 방향을 반환한다. 기획서와 씬 이미지를 만들 때 어느 ' +
      '브랜드로 만들지 여기서 고른다. 채널과 무관하므로 채널을 옮겨도 같은 목록이 온다. 경로에 적은 ' +
      '버전의 것만 오며, 저장한 적이 없으면 빈 배열이다. 각 항목의 연출 축에는 선택지의 현재 이름과 ' +
      '감독 노트가 함께 채워져 온다.',
  })
  @ApiQuery({ name: 'organizationId', description: '조회 대상이 속한 조직 id.' })
  @ApiQuery({
    name: 'ownerUserId',
    description: '세트의 주인(조직유저) id. 사람마다 분리되므로 남의 것은 조회되지 않는다.',
  })
  @Get('brand-concept')
  getBrandConcept(
    @PathToolVersion() version: ToolVersion,
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('ownerUserId', ParseIntPipe) ownerUserId: number,
  ) {
    return this.settingsService.getBrandConceptSets(
      ownerVersionScope({ organizationId, ownerUserId, version }),
    );
  }

  @ApiOperation({
    summary: '[PREF-008] 개인 브랜드/컨셉 세트 저장',
    description:
      '보낸 목록으로 통째로 바꾼다(부분 수정이 아니다). 브랜드명이 빈 항목은 저장하지 않는다. ' +
      '브랜드명이 세트를 구별하는 이름이라 같은 이름이 둘 이상이면 마지막 것만 남는다. ' +
      '연출 축은 어느 선택지를 골랐는지(축 key 와 옵션 key)만 저장하며, 선택지의 이름과 감독 노트는 ' +
      '조회할 때 카탈로그(/brand-concept-catalog)의 현재 문구로 채워진다. 경로에 적은 버전의 슬롯에만 ' +
      '저장하므로 다른 버전의 세트는 그대로 남고, 다른 사람의 세트에는 영향이 없다. ' +
      '세트가 더한 카테고리와 레퍼런스는 이 요청으로 바뀌지 않는다. 저장된 정의가 그대로 유지되며, ' +
      '그것을 고치려면 /user-settings/brand-concept/set 을 사용한다. customAxes 와 customOptions 를 ' +
      '함께 보내도 무시되고, 브랜드명을 바꾼 세트에서만 정의를 옮기는 데 쓰인다.',
  })
  @ApiResponse({
    status: 400,
    description:
      '선택지 목록(/brand-concept-catalog)에도 그 세트가 더한 카테고리에도 없는 축이나 옵션을 ' +
      '보냈거나, 설정 전체가 저장 상한을 넘었다.',
  })
  @Put('brand-concept')
  setBrandConcept(
    @PathToolVersion() version: ToolVersion,
    @Body() dto: SetBrandConceptDto,
  ) {
    // DTO → 도메인 세트 정규화(필드를 하나씩 옮기므로 새 필드 누락 시 값이 조용히 소실)
    const sets = dto.sets.map((s) => ({
      brandName: s.brandName,
      brandDescription: s.brandDescription ?? '',
      concepts: (s.concepts ?? []).map((c) => ({ axis: c.axis, option: c.option })),
      customAxes: (s.customAxes ?? []).map((a) => ({ key: a.key, label: a.label })),
      customOptions: (s.customOptions ?? []).map((o) => ({
        axis: o.axis,
        key: o.key,
        label: o.label,
        description: o.description ?? '',
      })),
    }));
    return this.settingsService.setBrandConceptSets(
      ownerVersionScope({
        organizationId: dto.organizationId,
        ownerUserId: dto.ownerUserId,
        version,
      }),
      sets,
    );
  }

  @ApiOperation({
    summary: '[PREF-009] 개인 브랜드/컨셉 세트 하나의 연출 저장',
    description:
      '세트 하나의 연출을 보낸 값으로 통째로 바꾼다. 연출은 그 세트가 더한 카테고리와 레퍼런스, ' +
      '그리고 각 카테고리에서 무엇을 골랐는지다. 브랜드명과 설명, 다른 세트는 바뀌지 않는다. ' +
      '세트 목록 저장(/user-settings/brand-concept)과 범위가 다르다. 그쪽은 목록 전체의 이름과 ' +
      '설명, 선택을 다루고 카테고리 정의는 손대지 않는다. 선택은 양쪽에서 저장되므로 나중에 저장한 ' +
      '쪽이 남는다. ' +
      '기본으로 제공하는 카테고리와 선택지(/brand-concept-catalog)는 이 요청으로 바뀌지 않는다. ' +
      '정의는 세트 안에 있으므로 같은 사람의 다른 세트에는 나타나지 않으며, 저장된 적 없는 ' +
      '브랜드명을 보내면 붙일 자리가 없어 404 다. ' +
      '카테고리나 레퍼런스를 목록에서 빼면 그것을 가리키던 선택도 함께 정리된다. ' +
      'key 는 클라이언트가 만들며 `x:` + 소문자 hex 4~32 형식이어야 한다. 그 형식이 아닌 정의, ' +
      '이름이 빈 정의, 기본 카테고리와 이름이 겹치는 카테고리, 없는 카테고리를 가리키는 레퍼런스는 ' +
      '저장되지 않는다. 이름을 바꿔도 key 가 그대로면 이미 고른 선택은 유지된다.',
  })
  @ApiResponse({ status: 404, description: '그 이름으로 저장된 브랜드/컨셉 세트가 없다.' })
  @ApiResponse({
    status: 400,
    description:
      '선택지 목록에도 그 세트가 더한 카테고리에도 없는 축이나 옵션을 보냈거나, 설정 전체가 저장 ' +
      '상한을 넘었다.',
  })
  @Put('brand-concept/set')
  setBrandConceptSetDetail(
    @PathToolVersion() version: ToolVersion,
    @Body() dto: SetBrandConceptSetDetailDto,
  ) {
    return this.settingsService.setBrandConceptSetDetail(
      ownerVersionScope({
        organizationId: dto.organizationId,
        ownerUserId: dto.ownerUserId,
        version,
      }),
      dto.brandName,
      {
        customAxes: dto.customAxes.map((a) => ({ key: a.key, label: a.label })),
        customOptions: dto.customOptions.map((o) => ({
          axis: o.axis,
          key: o.key,
          label: o.label,
          description: o.description ?? '',
        })),
        concepts: dto.concepts.map((c) => ({ axis: c.axis, option: c.option })),
      },
    );
  }
}
