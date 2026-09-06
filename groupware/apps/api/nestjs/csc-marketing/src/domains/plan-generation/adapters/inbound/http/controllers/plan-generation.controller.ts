import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  PathToolVersion,
  TOOL_VERSION_ROUTE,
} from '../../../../../../shared/adapters/inbound/http/tool-version.route';
import type { ToolVersion } from '../../../../../../shared/domain/tool-version';
import { workspaceScope } from '../../../../../../shared/domain/workspace-scope';
import { MAX_SCENE_COUNT, SEGMENT_LIMIT_EXCEEDED } from '../../../../core/domain';
import {
  PlanGenerationPort,
  PLAN_GENERATION_PORT,
} from '../../../../core/application/ports/inbound';
import {
  GeneratePlansDto,
  GenerateSceneImageDto,
  SetPlanPromptDto,
  SuggestFocusKeywordsDto,
} from '../dto';

/**
 * 기획서 생성 API: 수집 데이터와 채널 설정으로 기획안/씬 이미지를 만들고, 그 프롬프트를 보여준다.
 *
 * 경로가 `channels/...` 아래인 이유는 생성 컨텍스트(브랜드/컨셉, AI 모델, 목적 키워드)가 전부
 * 채널 스코프이기 때문이다. 채널 CRUD 는 채널 도메인 컨트롤러가 (버전 없는) 같은 접두사로 서빙한다.
 *
 * 도구 버전은 경로 세그먼트다: 프롬프트 조립 규칙과 모델 슬롯이 버전마다 갈리므로, 어느 버전으로
 * 만드는지가 이 경로의 입력이다.
 */
@ApiTags('[마케팅] 기획서 생성(plan-generation) API')
@ApiParam({
  name: 'version',
  description: '도구 버전(v1.0 / v1.5). 프롬프트 조립 규칙과 모델 슬롯이 이 값으로 갈린다.',
})
@Controller(`${TOOL_VERSION_ROUTE}/channels`)
export class PlanGenerationController {
  constructor(
    @Inject(PLAN_GENERATION_PORT)
    private readonly planService: PlanGenerationPort,
  ) {}

  @ApiOperation({
    summary: '[PLAN-001] 기획안 생성',
    description:
      '보낸 목적 키워드와 브랜드, 그리고 수집된 인기 검색어를 재료로 영상 기획안을 만든다. ' +
      '기획안 하나는 제목과 요약, 그리고 씬 목록으로 이루어진다. ' +
      '목적 키워드는 선택이다. 빈 배열로 보내면 브랜드와 브랜드 설명이 주제가 되어, 기획안이 다룰 ' +
      '소재를 스스로 잡는다. 무엇을 다룰지 아직 정하지 않았을 때 사용한다. ' +
      '연출 방향(표현 형식, 무드, 톤앤매너 등)은 브랜드에 저장된 조합을 쓰되, concepts 를 함께 보내면 ' +
      '이번 호출에만 그 조합을 쓴다. 저장된 조합은 바뀌지 않으므로 조합을 바꿔가며 여러 번 시도할 수 있다. ' +
      'brandName 을 빈 문자열로 보내면 저장된 브랜드를 쓰지 않는다. 그때는 주제도 연출 방향도 ' +
      'sceneBrief 에 적은 내용이 정하고, 적히지 않은 것은 모두 모델이 판단한다. ' +
      '씬이 어떤 항목을 갖는지는 버전마다 다르다. 경로의 버전 세그먼트가 그것을 정한다. ' +
      '기획안 개수도 버전이 고정할 수 있다. 그 버전에서는 proposalCount 를 몇으로 보내도 한 벌만 ' +
      '만들어지며, 요청과 다르면 서버 로그에 남는다. ' +
      '응답은 기획안 배열 하나가 아니라 proposals 와 llmModel 두 항목이다. llmModel 은 이 생성을 ' +
      '실제로 수행한 모델의 key 이고, 그 값을 POST /saved-plans 에 그대로 실어 보내면 저장된 ' +
      '기획안이 무엇으로 만들어졌는지 남는다. 채널에 기획 LLM 을 고르지 않았고 모델도 자기 이름을 ' +
      '밝히지 않으면 빈 문자열이다. ' +
      '결과는 저장하지 않으므로 마음에 들지 않으면 다시 호출하면 되고, 같은 입력이어도 결과는 매번 다르다. ' +
      '생성에는 보통 수십 초가 걸리며 그동안 응답을 기다린다.',
  })
  @ApiParam({ name: 'id', description: '기획안을 만들 채널 id.' })
  @ApiResponse({
    status: 400,
    description:
      'concepts 에 선택지 목록(/brand-concept-catalog)에 없는 축이나 옵션이 있다. ' +
      `또는 sceneBrief 를 정제한 결과가 동영상 ${MAX_SCENE_COUNT}개를 넘는다. 이때 본문의 code 는 ` +
      `${SEGMENT_LIMIT_EXCEEDED} 이고 error 에 사유 문장이 실린다. 입력을 합치거나 줄여야 하며 ` +
      '같은 입력으로 다시 호출하면 같은 응답이다.',
  })
  @ApiResponse({
    status: 404,
    description:
      '채널이 없거나, 보낸 브랜드명이 요청자의 브랜드 목록에 없다. ' +
      '빈 브랜드명은 조회 대상이 아니므로 이 응답이 나오지 않는다.',
  })
  @Post(':id/plans/generate')
  generatePlans(
    @PathToolVersion() version: ToolVersion,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GeneratePlansDto,
  ) {
    return this.planService.generatePlans(
      workspaceScope({
        organizationId: dto.organizationId,
        ownerUserId: dto.ownerUserId,
        channelId: id,
        version,
      }),
      dto.brandName,
      dto.purposeKeywords,
      dto.proposalCount,
      dto.sceneCount,
      dto.excludeInfographic ?? false,
      dto.concepts,
      dto.sceneBrief,
      dto.constraints,
    );
  }

  @ApiOperation({
    summary: '[PLAN-011] 포커스 키워드 후보 생성',
    description:
      '주제 한 줄로 그 주제를 찾을 때 쓰는 검색 키워드 후보를 만든다. 사람들이 실제로 검색창에 치는 ' +
      '짧은 말로, 증상과 원인과 해결처럼 서로 다른 각도로 흩어 놓는다. ' +
      '결과는 저장하지 않는다. 그중 고른 것을 저장하는 일은 채널 키워드 교체 저장이 한다. ' +
      '같은 주제로 다시 호출하면 다른 목록이 나온다.',
  })
  @ApiParam({ name: 'id', description: '후보를 만들 채널 id(채널이 고른 LLM 모델을 쓴다).' })
  @ApiResponse({ status: 400, description: '주제가 비어 있다.' })
  @ApiResponse({ status: 404, description: '그 조직에 그 채널이 없다.' })
  @Post(':id/keyword-suggestions')
  suggestFocusKeywords(
    @PathToolVersion() version: ToolVersion,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SuggestFocusKeywordsDto,
  ) {
    return this.planService.suggestFocusKeywords(
      workspaceScope({
        organizationId: dto.organizationId,
        ownerUserId: dto.ownerUserId,
        channelId: id,
        version,
      }),
      dto.seed,
    );
  }

  @ApiOperation({
    summary: '[PLAN-002] 씬 이미지 생성',
    description:
      '기획안 씬 하나의 이미지를 만든다. 같은 기획안의 씬들은 브랜드의 연출 방향을 공유해 화풍이 ' +
      '이어지고, 씬마다 구도는 달라진다. 같은 씬을 다시 요청하면 같은 그림이 나오며, variant 를 올리면 ' +
      '다른 버전이 나온다. ' +
      '연출 방향은 concepts 를 보내면 그 조합을, 보내지 않으면 브랜드에 저장된 조합을 쓴다. 기획안을 만들 때 ' +
      '쓴 조합을 함께 보내면 그 뒤에 브랜드 설정이 바뀌어도 처음 만든 그림과 화풍이 이어진다. ' +
      '이미지는 저장하지 않고 응답 본문에 담아 돌려준다. ' +
      '함께 오는 prompt 는 실제로 이미지 모델에 보낸 최종 문장이라 작업자가 결과를 이해하는 근거가 된다.',
  })
  @ApiParam({ name: 'id', description: '씬이 속한 채널 id.' })
  @ApiResponse({
    status: 400,
    description:
      '요청자가 이미지 생성 모델을 고르지 않았거나, concepts 에 선택지 목록에 없는 축이나 옵션이 있다.',
  })
  @ApiResponse({ status: 404, description: '채널이 없거나, 보낸 브랜드명이 요청자의 브랜드 목록에 없다.' })
  @Post(':id/plans/scene-image')
  generateSceneImage(
    @PathToolVersion() version: ToolVersion,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GenerateSceneImageDto,
  ) {
    const scope = workspaceScope({
      organizationId: dto.organizationId,
      ownerUserId: dto.ownerUserId,
      channelId: id,
      version,
    });
    return this.planService.generateSceneImage(scope, {
      brandName: dto.brandName,
      imagePrompt: dto.imagePrompt,
      proposalTitle: dto.proposalTitle,
      variant: dto.variant,
      concepts: dto.concepts,
    });
  }

  // 기획서 생성 프롬프트(작업자 편집 지침)

  @ApiOperation({
    summary: '[PLAN-004] 기획 지침 조회',
    description:
      '기획안을 만들 때 모델에게 주는 지시문을 보여준다. 앞뒤 고정 부분은 읽기 전용이고 가운데 지침만 ' +
      '작업자가 고칠 수 있다. 고친 적이 없으면 기본 지침이 그대로 온다. ' +
      '고정 부분의 한국어 번역과 기본 지침을 함께 주므로 화면이 원문과 번역을 나란히 보여줄 수 있다.',
  })
  @ApiParam({ name: 'channelId', description: '조회할 채널 id.' })
  @ApiQuery({ name: 'organizationId', description: '채널이 속한 조직 id.' })
  @ApiQuery({ name: 'ownerUserId', description: '조회하는 사람(조직유저) id. 표시되는 모델은 그 사람의 선택이다.' })
  @ApiResponse({ status: 404, description: '그 조직에 그 채널이 없다.' })
  @Get(':channelId/plan-prompt')
  getPlanPrompt(
    @PathToolVersion() version: ToolVersion,
    @Param('channelId', ParseIntPipe) channelId: number,
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('ownerUserId', ParseIntPipe) ownerUserId: number,
  ) {
    return this.planService.getPlanPrompt(
      workspaceScope({ organizationId, ownerUserId, channelId, version }),
    );
  }

  @ApiOperation({
    summary: '[PLAN-005] 기획 지침 저장',
    description:
      '가운데 지침을 바꾼다. 빈 값을 보내거나 기본 지침과 같은 내용을 보내면 저장을 비우므로, 이후 기본 ' +
      '지침이 바뀌면 그 최신 내용을 따라간다. 저장 후 갱신된 지시문 전체를 돌려준다.',
  })
  @ApiParam({ name: 'channelId', description: '지침을 저장할 채널 id.' })
  @ApiResponse({ status: 404, description: '그 조직에 그 채널이 없다.' })
  @Put(':channelId/plan-prompt')
  setPlanPrompt(
    @PathToolVersion() version: ToolVersion,
    @Param('channelId', ParseIntPipe) channelId: number,
    @Body() dto: SetPlanPromptDto,
  ) {
    return this.planService.setPlanPrompt(
      workspaceScope({
        organizationId: dto.organizationId,
        ownerUserId: dto.ownerUserId,
        channelId,
        version,
      }),
      dto.instructions ?? '',
    );
  }

  // 프로세스(읽기전용 뷰): 전체 파이프라인을 제작 3단계 × 실행 스텝(순차/병렬)으로

  @ApiOperation({
    summary: '[PLAN-006] 제작 과정 보기',
    description:
      '기획안에서 완성 영상까지의 과정을 단계와 실행 순서로 펼쳐 보여주는 읽기 전용 화면용 데이터다. ' +
      '지시문이 들어가는 단계에는 그 시점에 실제로 쓰이는 문장이 함께 담기므로, 채널 설정을 바꾸면 이 ' +
      '응답도 따라 바뀐다. 영상 단계의 지시문은 그 원문을 가진 영상 서버에서 받아 합치며, 받지 못하면 ' +
      '그 부분만 기본 설명으로 대체한다.',
  })
  @ApiParam({ name: 'channelId', description: '조회할 채널 id.' })
  @ApiQuery({ name: 'organizationId', description: '채널이 속한 조직 id.' })
  @ApiQuery({ name: 'ownerUserId', description: '조회하는 사람(조직유저) id. 표시되는 모델은 그 사람의 선택이다.' })
  @ApiResponse({ status: 404, description: '그 조직에 그 채널이 없다.' })
  @Get(':channelId/process')
  getProcessView(
    @PathToolVersion() version: ToolVersion,
    @Param('channelId', ParseIntPipe) channelId: number,
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @Query('ownerUserId', ParseIntPipe) ownerUserId: number,
  ) {
    return this.planService.getProcessView(
      workspaceScope({ organizationId, ownerUserId, channelId, version }),
    );
  }
}
