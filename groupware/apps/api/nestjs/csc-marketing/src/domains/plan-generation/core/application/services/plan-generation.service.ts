import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { aspectPromptLabelFor, imageSizeFor } from '@csc/video-capabilities';
import {
  PlanPromptView,
  ProcessView,
  PlanImageEngineLoad,
  clampPlanCount,
  clampSceneCount,
  renderRefinedBrief,
  segmentLimitMessage,
  stableSeed,
  MAX_SCENE_COUNT,
  SEGMENT_LIMIT_EXCEEDED,
  FOCUS_KEYWORD_MAX,
  FOCUS_KEYWORD_MAX_ATTEMPTS,
  FOCUS_KEYWORD_SUGGESTION_COUNT,
  PLAN_IMAGE_QUALITY,
} from '../../domain';
import {
  FocusKeywordCandidate,
  GeneratedPlans,
  PlanGenerationPort,
  SceneImageInput,
} from '../ports/inbound';
import {
  PlanGeneratorPort,
  PLAN_GENERATORS,
  PlanImageGeneratorPort,
  PLAN_IMAGE_GENERATOR_PORT,
  FocusKeywordGeneratorPort,
  FOCUS_KEYWORD_GENERATOR_PORT,
  BriefRefinerPort,
  BRIEF_REFINER_PORT,
  PLAN_PROMPT_ASSEMBLERS,
  PlanProcessViewBuilder,
  PLAN_PROCESS_VIEWS,
  AudioAssetCandidate,
  VideoModelPromptPort,
  VIDEO_MODEL_PROMPT_PORT,
} from '../ports/outbound';
import {
  ChannelPort,
  CHANNEL_PORT,
} from '../../../../channel/core/application/ports/inbound';
import {
  ChannelSettingsPort,
  CHANNEL_SETTINGS_PORT,
} from '../../../../channel-settings/core/application/ports/inbound';
import {
  ConceptChoice,
  ConceptSelection,
  createConceptResolver,
  isCustomConceptKey,
} from '../../../../channel-settings/core/domain';
import {
  CommonAssetPort,
  COMMON_ASSET_PORT,
} from '../../../../common-asset/core/application/ports/inbound';
import {
  CommonAssetEntity,
  CommonAssetCategory,
} from '../../../../common-asset/core/domain';
import {
  ActivityLogPort,
  ACTIVITY_LOG_PORT,
  buildCostSnapshot,
  tokenTotals,
} from '../../../../../shared/domain/activity-log';
import type {
  OwnerVersionScope,
  WorkspaceScope,
} from '../../../../../shared/domain/workspace-scope';
import type { VersionRegistry } from '../../../../../shared/domain/version-registry';
import {
  imageModelForVersion,
  pipelineFor,
  planLlmForVersion,
  proposalCountForVersion,
} from '../../../../../shared/domain/version-pipeline';
import type { PlanPromptAssembler } from '../ports/outbound';
import { isLongTailOf } from '../../../../../shared/domain/keyword-form';
import { BillingUnit } from '@csc/pricing';

// 프롬프트에 실을 카테고리별 오디오 후보 상한. 프롬프트 비대화 방어(초과분은 로그)
const AUDIO_CANDIDATE_CAP = 40;

/** 후보 비교용 정규화: 공백 제거 + 소문자, 검색어의 띄어쓰기 흔들림 흡수 */
const normalizeKeyword = (value: string): string => value.replace(/\s+/g, '').toLowerCase();

/**
 * PlanGenerationPort 구현: 기획안 생성, 씬 이미지 생성, 그 프롬프트 읽기 뷰
 * 소유하는 것은 프롬프트 조립 규칙뿐, 재료(목적 키워드, 브랜드/컨셉, 편집 지침, AI 모델)는 다른 도메인에서 옴
 */
@Injectable()
export class PlanGenerationService implements PlanGenerationPort {
  constructor(
    // 버전별 기획 생성기. 아래 조립기와 같은 방식으로 표에서 고른다.
    @Inject(PLAN_GENERATORS)
    private readonly planGenerators: VersionRegistry<PlanGeneratorPort>,
    @Inject(PLAN_IMAGE_GENERATOR_PORT)
    private readonly planImageGenerator: PlanImageGeneratorPort,
    // 버전별 프롬프트 조립기. 요청 스코프 DI 가 아니라 표에서 고르는 이유는
    // 사가 복구 러너가 HTTP 요청 밖에서 돌아 요청에 매달린 주입이 성립하지 않기 때문
    @Inject(PLAN_PROMPT_ASSEMBLERS)
    private readonly prompts: VersionRegistry<PlanPromptAssembler>,
    // 버전별 프로세스 뷰 빌더. 표의 키가 곧 버전이라 빌더는 버전을 인자로 받지 않는다.
    @Inject(PLAN_PROCESS_VIEWS)
    private readonly processViews: VersionRegistry<PlanProcessViewBuilder>,
    // 포커스 키워드 후보: 씨앗 한 줄 → 검색 키워드 목록(저장은 단어 도메인의 일)
    @Inject(FOCUS_KEYWORD_GENERATOR_PORT)
    private readonly focusKeywords: FocusKeywordGeneratorPort,
    // 입력 정제: 작업자가 적은 원문 → 파이프라인이 읽는 동영상 단위(정제하는 버전에서만 부른다)
    @Inject(BRIEF_REFINER_PORT)
    private readonly briefRefiner: BriefRefinerPort,
    // 프로세스 뷰의 원천 영상 단계 프롬프트. 원문 주인인 video-model 에서 받아 온다(복제하지 않음)
    @Inject(VIDEO_MODEL_PROMPT_PORT)
    private readonly videoModelPrompts: VideoModelPromptPort,
    // 기획 프롬프트에 실을 BGM/효과음 후보(공통 ∪ 자기 org ∪ 활성 팩)
    @Inject(COMMON_ASSET_PORT)
    private readonly commonAssets: CommonAssetPort,
    @Inject(CHANNEL_PORT)
    private readonly channels: ChannelPort,
    @Inject(CHANNEL_SETTINGS_PORT)
    private readonly settings: ChannelSettingsPort,
    @Inject(ACTIVITY_LOG_PORT)
    private readonly activityLog: ActivityLogPort,
  ) {}

  private readonly logger = new Logger(PlanGenerationService.name);

  /**
   * 수집 데이터로 기획안 생성. 목적 키워드 + 브랜드/컨셉 + 확장형 소스 인사이트 + 선택 LLM 모델을
   * 컨텍스트로 조립해 PlanGeneratorPort(LLM)에 위임
   */
  async generatePlans(
    scope: WorkspaceScope,
    brandName: string,
    purposeKeywords: string[],
    proposalCount: number,
    sceneCount: number,
    excludeInfographic = false,
    concepts?: ConceptChoice[],
    sceneBrief?: string,
    constraints?: string,
  ): Promise<GeneratedPlans> {
    const channel = await this.requireChannel(scope);
    // 목적 키워드: 요청에 실려 온 값(저장하지 않음), 트림 + 빈 값 제거 + 중복 제거 후 상한 컷
    // 빈 배열도 유효하다. 다룰 것을 아직 정하지 않았을 때 브랜드와 브랜드 설명이 주제가 되는 정상 경로
    const keywords = [
      ...new Set(purposeKeywords.map((v) => v.trim()).filter((v) => v.length > 0)),
    ].slice(0, FOCUS_KEYWORD_MAX);
    // 씬/사용자 입력사항: 공백만 적은 것은 미입력 취급(화면 글자 수 표시와 같은 기준)
    // 빈 문자열이면 프롬프트에서 그 절 자체가 빠진다. 빈 칸을 남기면 모델이 채울 곳으로 읽음
    const brief = (sceneBrief ?? '').trim();
    const limits = (constraints ?? '').trim();
    // 브랜드/컨셉: 만드는 사람 본인의 세트에서 이름으로 고름(채널 무관), 축 조합은 요청이 덮을 수 있음
    // 브랜드명이 비면 세트를 고르지 않은 경로(프롬프트 입력 방식): 연출을 정하는 값이 아예 없음
    const brand = await this.resolveBrand(scope, brandName, concepts);
    // 직접 적은 지시는 기획 LLM 에 닿기 전에 정제된다(정제하는 버전에서). 형식이 자유라 그대로
    //   넘기면 시간 구간과 따로 모은 나레이션의 해석이 생성마다 갈린다. 브랜드 검증 뒤인 이유:
    //   유료 호출이라 요청 자체가 틀린 경우(없는 브랜드)에는 부르지 않는다.
    const refined = await this.refineBriefs(scope, brief, limits);
    const effectiveBrief = refined ? refined.sceneBrief : brief;
    const effectiveLimits = refined ? refined.constraints : limits;
    // 본인이 고른 LLM 모델 + 채널의 편집 지침 + 오디오 후보(BGM/SFX)
    // 수집 데이터는 여기 없다. 키워드 검색 단계에서 이미 쓰였고 기획서는 고른 키워드만 받음
    // 오디오 후보 조회 실패는 삼켜 생성을 막지 않음. BGM 은 렌더 경계에서 강제하므로 여기선 best-effort
    const [aiModels, instructions, assets] = await Promise.all([
      this.settings.getAiModels(scope),
      this.resolvePlanInstructions(scope),
      this.commonAssets.list(scope.organizationId).catch((e) => {
        this.logger.warn(`오디오 후보 조회 실패(org=${scope.organizationId}): ${String(e)}`);
        return [] as CommonAssetEntity[];
      }),
    ]);

    // 프롬프트는 이 버전의 조립기가 만든다(어댑터는 호출과 파싱만)
    const prompts = this.prompts[scope.version];
    // 기획안 수: 공통 범위로 먼저 걸러 그다음 그 버전의 규칙이 이김
    // 순서가 이래야 고정하지 않는 버전에서 범위 밖 값이 상한으로 접힌다.
    const requestedProposals = clampPlanCount(proposalCount);
    const pinnedProposals = proposalCountForVersion(scope.version, requestedProposals);
    if (pinnedProposals !== requestedProposals) {
      // 화면에 고를 자리가 없어 이 로그는 대개 화면 쪽 회귀나 낡은 탭 신호
      // 결과는 맞게 나오므로 남기지 않으면 그 회귀가 아무 신호 없이 지나간다.
      this.logger.warn(
        `${scope.version} 은 기획안 ${pinnedProposals}개로 고정된다(요청: ${requestedProposals}).`,
      );
    }
    const counts = {
      proposalCount: pinnedProposals,
      // 정제가 동영상 단위를 확정했으면 그 수가 요청값을 이긴다. 화면의 셈은 번호 표기에 의존한
      //   어림값이라 "동영상1 (0-8초)" 처럼 적으면 세지 못해 기본값을 보낸다.
      sceneCount: clampSceneCount(refined?.segmentCount ?? sceneCount),
    };
    const userContext = {
      channelName: channel.name,
      brand: {
        name: brand.brandName,
        description: brand.brandDescription,
        concepts: brand.concepts,
      },
      purposeKeywords: keywords,
      sceneBrief: effectiveBrief,
      constraints: effectiveLimits,
      proposalCount: counts.proposalCount,
      bgmCandidates: this.buildAudioCandidates(assets, 'BGM'),
      // 효과음 후보는 그 자리가 있는 버전에만 만든다. 부재가 곧 "이 버전은 효과음을
      // 배치하지 않는다"(프롬프트도 파서도 같다)
      ...(prompts.offersSceneSfx
        ? { sfxCandidates: this.buildAudioCandidates(assets, 'SFX') }
        : {}),
    };

    const imageModel = imageModelForVersion(scope.version, aiModels.image);
    // 이 버전이 실제로 부를 기획 LLM. 아래 호출과 비용 스냅샷이 같은 값을 봐야 함
    const planLlm = planLlmForVersion(scope.version, aiModels.llm);

    // 동기 호출이라 관측 시각이 곧 실제 소요(폴링 관측과 달리 정확)
    const startedAt = Date.now();
    const generated = await this.planGenerators[scope.version].generate({
      systemPrompt: prompts.systemPrompt({
        instructions,
        ...counts,
        excludeInfographic,
        // 씬 이미지를 만들 벤더. 기획 프롬프트가 그 벤더가 거부할 연출을 피하는 데 씀
        imageModel,
        // 목적 키워드는 선택. 없으면 머리말과 주제 지시가 브랜드 기준으로 갈림
        hasPurposeKeywords: keywords.length > 0,
        // 브랜드도 선택(프롬프트 입력 방식에는 없음). 둘 다 없으면 씬 입력 본문이 주제
        hasBrand: brand.brandName.length > 0,
        // 연출 축을 하나라도 골랐는가. 브랜드만 고르고 축을 비운 생성은 모델이 정하되 일관되게
        hasConcepts: brand.concepts.length > 0,
      }),
      userPrompt: prompts.userPrompt(userContext),
      organizationId: scope.organizationId,
      // 개수는 어댑터가 출력 토큰 예산을 잡는 데 씀(프롬프트 재료로 다시 넘기지 않음)
      ...counts,
      // 후보 목록은 모델이 고른 id 를 스냅샷으로 되돌리는 데 씀
      // 효과음은 그 자리가 있는 버전에만 실린다(위 userContext 와 같은 판정)
      bgmCandidates: userContext.bgmCandidates,
      ...(userContext.sfxCandidates ? { sfxCandidates: userContext.sfxCandidates } : {}),
      model: planLlm,
    });
    const { proposals, usage } = generated;
    // 사용량이 없으면(구 서버) 빈 units. computeCost 가 유료 모델은 'usage-missing'(금액 null),
    // 사내 모델은 'free'(0) 로 갈라 주므로 여기서 0 을 만들지 않는 것이 핵심
    const units: Partial<Record<BillingUnit, number>> = usage
      ? {
          [BillingUnit.TextInputToken]: usage.inputTokens,
          [BillingUnit.TextOutputToken]: usage.outputTokens,
        }
      : {};
    // 비용은 실제로 응답한 모델에 귀속(요청이 빈 값이면 서버가 고른 모델)
    const costModel = usage?.model || planLlm;
    this.activityLog.log({
      organizationId: scope.organizationId,
      actorUserId: scope.ownerUserId,
      channelId: scope.channelId,
      version: scope.version,
      action: 'plan.generated',
      // 브랜드가 없는 경로에서는 그 자리를 주제로 대신 채움
      // 빈 이름을 그대로 쓰면 무엇으로 만든 것인지 없는 줄이 원장에 남음
      message: `기획서 생성: ${brand.brandName || '직접 입력'} (기획안 ${proposals.length}건)`,
      durationMs: Date.now() - startedAt,
      usage: tokenTotals(units, [BillingUnit.TextInputToken], [BillingUnit.TextOutputToken]),
      cost: buildCostSnapshot({ modelKey: costModel, units }),
      // 기획안은 저장하지 않는 휘발성 결과라 가리킬 엔티티가 없음, 채널을 대상으로 둠
      target: { kind: 'channel', id: scope.channelId },
      detail: {
        llm_model: costModel,
        brand_name: brand.brandName,
        // 손으로 튜닝한 추정치와 실측을 나란히 남김. 실측이 쌓이면 상수를 근거 있게 조정 가능
        estimated_output_tokens: generated.estimatedOutputTokens,
        proposal_count: proposals.length,
        scene_count: counts.sceneCount,
        exclude_infographic: excludeInfographic,
        // 정제를 거쳤는가. 거쳤으면 바로 앞의 plan.brief_refined 행이 원문과 정제본을 갖는다.
        brief_refined: refined !== null,
      },
    });
    // 실제로 부른 모델을 함께 반환. 원장에 쓰는 값과 같은 변수라 둘이 갈릴 수 없고,
    // 저장이 이 값을 되돌려 주면 그대로 굳는다(설정을 다시 읽으면 쓰지 않은 모델이 기록됨)
    return { proposals, llmModel: costModel };
  }

  /**
   * 작업자가 직접 적은 지시를 파이프라인이 읽는 형식으로 정제한다. 부르지 않으면 null
   * 부르지 않는 경우 둘: 정제하지 않는 버전(직접 적는 칸이 없다), 두 칸이 모두 비었을 때
   * 실패는 그대로 올린다. 원문으로 조용히 진행하면 정제가 없던 때의 결과가 아무 신호 없이 나온다.
   */
  private async refineBriefs(
    scope: WorkspaceScope,
    brief: string,
    limits: string,
  ): Promise<{ sceneBrief: string; constraints: string; segmentCount: number | null } | null> {
    const model = pipelineFor(scope.version).briefRefinerLlm;
    if (!model || (!brief && !limits)) return null;

    const prompts = this.prompts[scope.version];
    const ctx = { sceneBrief: brief, constraints: limits };
    const startedAt = Date.now();
    const result = await this.briefRefiner.refine({
      organizationId: scope.organizationId,
      systemPrompt: prompts.briefRefinerSystemPrompt(ctx),
      userPrompt: prompts.briefRefinerUserPrompt(ctx),
      model,
    });
    // 브리프가 없으면 동영상도 없어야 한다. 모델이 제한사항에서 동영상을 지어냈다면 버린다.
    const refined = brief ? result.refined : { ...result.refined, segments: [] };
    const rendered = renderRefinedBrief(refined);
    const rejection = this.rejectRefinement(brief, refined.segments.length);

    // 거절해도 기록한다. 이미 돈이 나간 호출이고 원장의 금액이 맞아야 한다. 거절은 failed 로 남긴다.
    const units: Partial<Record<BillingUnit, number>> = result.usage
      ? {
          [BillingUnit.TextInputToken]: result.usage.inputTokens,
          [BillingUnit.TextOutputToken]: result.usage.outputTokens,
        }
      : {};
    const costModel = result.usage?.model || model;
    this.activityLog.log({
      organizationId: scope.organizationId,
      actorUserId: scope.ownerUserId,
      channelId: scope.channelId,
      version: scope.version,
      action: 'plan.brief_refined',
      message: rejection
        ? `입력 정제 거절: ${rejection.message}`
        : `입력 정제: 동영상 ${refined.segments.length}개, 제한 ${refined.constraints.length}줄`,
      durationMs: Date.now() - startedAt,
      usage: tokenTotals(units, [BillingUnit.TextInputToken], [BillingUnit.TextOutputToken]),
      cost: buildCostSnapshot({ modelKey: costModel, units }),
      target: { kind: 'channel', id: scope.channelId },
      failed: rejection !== null,
      // 원문과 정제본을 나란히 남긴다. "왜 내 지시가 이렇게 바뀌었나" 의 답이 이 행에 있어야 한다.
      detail: {
        llm_model: costModel,
        segment_count: refined.segments.length,
        raw_scene_brief: brief,
        raw_constraints: limits,
        refined_scene_brief: rendered.sceneBrief,
        refined_constraints: rendered.constraints,
        notes: refined.notes,
      },
    });
    if (rejection) throw rejection.exception;
    return { ...rendered, segmentCount: brief ? refined.segments.length : null };
  }

  /**
   * 정제 결과로 기획을 만들 수 없는 경우. 없으면 null
   * 동영상이 하나도 없음: 빈 정제본을 넘기면 기획 LLM 이 사용자 입력사항 없는 프롬프트를 받아 적은
   *   것과 무관한 영상을 만든다(500, 다시 시도)
   * 상한 초과: 합쳐서 맞추면 작업자가 나눈 단위가 말없이 바뀐다. 400 에 코드를 실어 화면이 사유를
   *   알리고 배치를 걷게 한다(재시도해도 같은 실패라 사람이 입력을 고쳐야 한다)
   * 문장을 예외와 따로 돌려주는 이유: 객체 본문으로 만든 Nest 예외의 message 는 사유가 아니라
   *   "Bad Request Exception" 이라, 원장에 그것을 적으면 왜 거절됐는지 남지 않는다.
   */
  private rejectRefinement(
    brief: string,
    segmentCount: number,
  ): { message: string; exception: HttpException } | null {
    if (brief && segmentCount === 0) {
      const message = '입력을 정제하지 못했습니다(동영상을 하나도 읽지 못함). 다시 시도해 주세요.';
      return { message, exception: new InternalServerErrorException(message) };
    }
    if (segmentCount > MAX_SCENE_COUNT) {
      const message = segmentLimitMessage(segmentCount);
      // 본문 모양이 계약이다. web 은 `error` 를 사용자 문장으로, `code` 를 기계 판별로 읽는다.
      return {
        message,
        exception: new BadRequestException({
          statusCode: 400,
          error: message,
          code: SEGMENT_LIMIT_EXCEEDED,
        }),
      };
    }
    return null;
  }

  /**
   * 오디오 후보 구성: 카테고리로 걸러 프롬프트용 항목으로 변환, 상한 캡(초과 시 로그)
   * list(owner) 가 sortOrder 순 정렬본이라 필터 후에도 순서가 유지된다(파서의 BGM 폴백이 첫 후보를 고름)
   */
  private buildAudioCandidates(
    assets: CommonAssetEntity[],
    category: CommonAssetCategory,
  ): AudioAssetCandidate[] {
    const all = assets.filter((a) => a.category === category);
    const capped = all.slice(0, AUDIO_CANDIDATE_CAP);
    if (all.length > capped.length) {
      this.logger.warn(
        `${category} 후보 ${all.length}개 중 ${capped.length}개만 프롬프트에 사용(cap ${AUDIO_CANDIDATE_CAP}).`,
      );
    }
    return capped.map((a) => ({
      id: a.id,
      name: a.name,
      uploadId: a.uploadId,
      tags: a.tags.map((t) => ({ axisKey: t.axisKey, value: t.value })),
    }));
  }

  async generateSceneImage(
    scope: WorkspaceScope,
    input: SceneImageInput,
  ): Promise<{ dataUrl: string; prompt: string }> {
    // 채널을 명시적으로 검증. 세트가 개인 스코프로 옮겨지며 브랜드 조회에 얹혀 있던 검증이 사라졌고,
    // 남의 조직 채널 id 로 통과하면 아래 활동 로그 대상에 그 id 가 그대로 박힘
    await this.assertChannelExists(scope);
    // 이 버전이 씬 이미지를 쓰지 않으면 아예 만들지 않음. 낡은 탭이나 직접 호출이 여기로 오면
    // 결과물에 쓰이지 않는 이미지가 사내 GPU 를 점유하고 그 사실은 아무 에러도 내지 않음
    if (!pipelineFor(scope.version).usesSceneImages) {
      throw new BadRequestException('이 버전은 씬 이미지를 사용하지 않습니다.');
    }
    // 본인이 이 버전에서 고른 이미지 생성 모델(미설정이면 생성 불가: 400)
    const aiModels = await this.settings.getAiModels(scope);
    const model = aiModels.image;
    if (!model) {
      throw new BadRequestException(
        '이미지 생성 모델이 설정되지 않았습니다. 환경설정에서 이미지 생성 모델을 선택하세요.',
      );
    }
    // 이미지 크기와 구도 지시가 같은 화면비에서 나옴. 갈리면 그림과 렌더 캔버스가 어긋나
    // 위아래(또는 좌우)가 잘리고 그 사실은 결과 영상을 보고서야 드러남
    const aspectRatio = pipelineFor(scope.version).aspectRatio;
    // 브랜드/컨셉: 스타일 앵커의 근거(같은 기획안 씬끼리 동일 앵커 = 일관성), 본인 세트에서 고름
    // 기획안이 들고 있는 조합을 쓴다. 세트를 다시 읽으면 그 사이 세트가 바뀌었거나 임의 조합으로
    // 만든 기획안일 때 처음 이미지와 연출이 어긋남
    const brand = await this.resolveBrand(scope, input.brandName, input.concepts);
    const prompt = this.prompts[scope.version].sceneImagePrompt(
      {
        name: brand.brandName,
        description: brand.brandDescription,
        concepts: brand.concepts,
      },
      { imagePrompt: input.imagePrompt, aspectLabel: aspectPromptLabelFor(aspectRatio) },
    );
    // 동기 호출이라 관측 시각이 곧 실제 소요(폴링 관측과 달리 정확)
    const imageStartedAt = Date.now();
    const result = await this.planImageGenerator.generate({
      organizationId: scope.organizationId,
      model,
      prompt,
      size: imageSizeFor(aspectRatio),
      quality: PLAN_IMAGE_QUALITY,
      // 씬마다 다른 seed(제목 + 장면 연출 기반) → 씬별 다른 구도. FLUX 는 seed(초기 노이즈)가
      // 구도를 지배하므로 씬끼리 같은 seed 는 구도를 복제한다(스타일 일관성은 프롬프트 공유 앵커가 담당)
      // 같은 씬 재생성은 동일 seed(재현성), variant 가 오르면 다른 seed
      seed: stableSeed(
        `${input.proposalTitle ?? input.brandName}#${input.imagePrompt}#${input.variant ?? 0}`,
      ),
    });
    // 사용량이 없으면 빈 units. 유료/사내 구분은 우리가 아니라 단가 카드의 billing 이 함
    const imageUnits: Partial<Record<BillingUnit, number>> = result.usage
      ? {
          [BillingUnit.TextInputToken]: result.usage.inputTextTokens,
          [BillingUnit.ImageInputToken]: result.usage.inputImageTokens,
          [BillingUnit.ImageOutputToken]: result.usage.outputImageTokens,
        }
      : {};
    // 비용은 실제로 그린 모델에 귀속
    const imageCostModel = result.usage?.model || model;
    this.activityLog.log({
      organizationId: scope.organizationId,
      actorUserId: scope.ownerUserId,
      channelId: scope.channelId,
      version: scope.version,
      action: 'plan.scene_image_generated',
      message: `씬 이미지 생성: ${input.proposalTitle ?? input.brandName}`,
      durationMs: Date.now() - imageStartedAt,
      target: { kind: 'channel', id: scope.channelId },
      // 이미지는 입력이 텍스트/이미지로 갈려 승격 컬럼에는 합쳐 싣는다(집계는 총량만 씀)
      // 단위별 내역은 payload.cost.units 에 그대로 남아 재계산 가능
      usage: tokenTotals(
        imageUnits,
        [BillingUnit.TextInputToken, BillingUnit.ImageInputToken],
        [BillingUnit.ImageOutputToken],
      ),
      cost: buildCostSnapshot({ modelKey: imageCostModel, units: imageUnits }),
      detail: {
        image_model: imageCostModel,
        brand_name: input.brandName,
        variant: input.variant ?? 0,
      },
    });
    // prompt 를 함께 반환. 작업자가 상세에서 실제로 들어간 값을 확인(조립한 쪽이 진실원)
    return { dataUrl: `data:${result.mimeType};base64,${result.b64}`, prompt };
  }

  /**
   * 포커스 키워드 후보: 수집이 먼저, LLM 은 보완
   * 수집은 실제로 검색된 말이고 LLM 은 그럴듯한 말이라 origin 을 달아 화면이 구분해 보여준다.
   * 수집만으로 목표 개수가 차면 LLM 을 부르지 않음(비용과 지연을 아끼고 실측이 있으면 그것이 낫다)
   */
  async suggestFocusKeywords(
    scope: WorkspaceScope,
    seed: string,
  ): Promise<FocusKeywordCandidate[]> {
    const channel = await this.requireChannel(scope);
    const trimmed = seed.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException('주제를 입력해 주세요.');
    }

    const collected = await this.settings.collectKeywordCandidates(trimmed);
    const candidates: FocusKeywordCandidate[] = collected
      .slice(0, FOCUS_KEYWORD_SUGGESTION_COUNT)
      .map((c) => ({
        keyword: c.keyword,
        origin: 'collected' as const,
        source: { key: c.sourceKey, label: c.sourceLabel },
        monthlySearches: c.monthlySearches,
      }));

    if (candidates.length >= FOCUS_KEYWORD_SUGGESTION_COUNT) return candidates;

    // 기획서 생성과 같은 모델로 뽑아야 결이 맞음. 고정 모델이 있는 버전은 그것을 씀
    const models = await this.settings.getAiModels(scope);
    const planLlm = planLlmForVersion(scope.version, models.llm);
    const seen = new Set(candidates.map((c) => normalizeKeyword(c.keyword)));

    // 목표 개수를 채우는 것이 계약. 모자라면 남은 만큼 다시 부르되 상한을 둔다.
    // 새 말이 더 없는 주제에서 같은 호출이 끝없이 반복되면 응답이 돌아오지 않음
    for (let attempt = 0; attempt < FOCUS_KEYWORD_MAX_ATTEMPTS; attempt += 1) {
      const needed = FOCUS_KEYWORD_SUGGESTION_COUNT - candidates.length;
      if (needed <= 0) break;

      let generated: string[] = [];
      try {
        // 프롬프트는 이 버전의 조립기가 만든다. 조립이 전송 계층으로 새면 어댑터가 버전을 알아야 함
        const prompts = this.prompts[scope.version];
        generated = await this.focusKeywords.suggest({
          organizationId: scope.organizationId,
          systemPrompt: prompts.focusKeywordSystemPrompt,
          userPrompt: prompts.focusKeywordUserPrompt({
            seed: trimmed,
            channelName: channel.name,
            existing: candidates.map((c) => c.keyword),
            needed,
          }),
          needed,
          model: planLlm,
        });
      } catch (err) {
        // 수집 후보가 있으면 보완 실패로 전체를 막지 않음. 하나도 없을 때만 오류를 올린다.
        // (그때는 빈 목록이 "결과 없음"과 "생성 실패"를 구분하지 못함)
        this.logger.warn(
          `포커스 키워드 보완 실패(org=${scope.organizationId}, ch=${scope.channelId}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        if (candidates.length === 0) throw err;
        break;
      }

      // 보완분도 수집분과 같은 잣대로 거른다. 어긴 값이 그대로 나가면 한 목록에 롱테일과
      // 아닌 것이 섞이고, 버린 만큼은 다음 회차가 다시 채움
      const before = candidates.length;
      for (const keyword of generated) {
        if (candidates.length >= FOCUS_KEYWORD_SUGGESTION_COUNT) break;
        const key = normalizeKeyword(keyword);
        if (!key || seen.has(key)) continue;
        if (!isLongTailOf(keyword, trimmed)) continue;
        seen.add(key);
        candidates.push({ keyword, origin: 'generated' });
      }
      // 한 바퀴 돌았는데 하나도 못 늘었으면 더 불러도 같음, 호출을 아낌
      if (candidates.length === before) {
        this.logger.warn(
          `포커스 키워드 보완분이 모두 걸러짐(seed=${trimmed}): ${generated.join(', ') || '없음'}`,
        );
        break;
      }
    }

    if (candidates.length < FOCUS_KEYWORD_SUGGESTION_COUNT) {
      // 화면은 받은 만큼 보여준다. 못 채운 사실은 로그로(조용히 적게 주는 것보다 나음)
      this.logger.warn(
        `포커스 키워드 목표 미달(org=${scope.organizationId}, ch=${scope.channelId}, seed=${trimmed}): ` +
          `${candidates.length}/${FOCUS_KEYWORD_SUGGESTION_COUNT}`,
      );
    }
    return candidates;
  }

  async getSceneImageEngineLoad(
    scope: OwnerVersionScope,
  ): Promise<PlanImageEngineLoad | null> {
    // 이 버전에서 쓰는 이미지 모델이 없으면 그릴 엔진도 없음(null)
    // 씬 이미지를 만들지 않는 버전은 저장값이 남아 있어도 없는 것으로 본다.
    const aiModels = await this.settings.getAiModels(scope);
    const model = imageModelForVersion(scope.version, aiModels.image);
    if (!model) return null;
    // 모델에서 엔진(자체 GPU / 외부 벤더)을 가리는 것은 LLM 서버의 일. 외부면 큐가 없어 null
    return this.planImageGenerator.engineLoad(model);
  }

  /** 기획서 생성 프롬프트 뷰: 고정 머리/꼬리 + 이미지 안전 제약 + 현재 지침 + 기본값 */
  async getPlanPrompt(scope: WorkspaceScope): Promise<PlanPromptView> {
    await this.assertChannelExists(scope);
    // 고정부와 안전 제약은 이 버전의 조립기가 준다. 실제 생성과 같은 출처라 화면과 실물이 어긋나지 않음
    const [instructions, aiModels] = await Promise.all([
      this.resolvePlanInstructions(scope),
      this.settings.getAiModels(scope),
    ]);
    return this.prompts[scope.version].promptView(
      instructions,
      imageModelForVersion(scope.version, aiModels.image),
    );
  }

  /**
   * 편집 지침 저장. 기본 지침과 같거나 비면 저장을 비움(항상 최신 기본값을 따르도록)
   * 그 판단이 여기 있는 이유는 기본 지침이 프롬프트 조립 규칙의 일부라서, 저장 자체는 설정 도메인의 일
   */
  async setPlanPrompt(
    scope: WorkspaceScope,
    instructions: string,
  ): Promise<PlanPromptView> {
    const trimmed = (typeof instructions === 'string' ? instructions : '').trim();
    // 이 버전의 기본 지침과 비교. 버전마다 문장이 달라 한쪽 것으로 비교하면
    // 다른 버전은 기본을 저장해도 커스텀으로 굳는다.
    const fallback = this.prompts[scope.version].defaultInstructions;
    const value = trimmed === fallback.trim() ? '' : trimmed;
    await this.settings.setPlanInstructionsOverride(scope, scope.channelId, value);
    return this.getPlanPrompt(scope);
  }

  /**
   * 채널이 이 버전에 저장한 지침, 없으면 기본 지침. 생성과 뷰가 같은 값을 보도록 한 곳에서만 정함
   * 지침이 버전별인 이유: 그 버전 프롬프트 구조를 전제로 쓴 문장이라 한 벌을 공유하면 전제가 섞임
   */
  private async resolvePlanInstructions(scope: WorkspaceScope): Promise<string> {
    const override = await this.settings.getPlanInstructionsOverride(
      scope.channelId,
      scope.version,
    );
    return override.length > 0 ? override : this.prompts[scope.version].defaultInstructions;
  }

  /**
   * 프로세스 뷰(읽기전용): 파이프라인을 제작 3단계 × 실행 스텝(순차/병렬)으로 노드화하고
   * 프롬프트가 주입되는 스텝만 세그먼트를 담음
   * 프롬프트 노드는 실제 조립 세그먼트에서 파생되므로 여기서는 채널 상태(현재 지침, 이미지 모델)만
   * 해석해 넘기고, 원천 영상 단계 프롬프트는 주인인 video-model 에서 받아 병합(조회 실패는 폴백)
   */
  async getProcessView(scope: WorkspaceScope): Promise<ProcessView> {
    await this.assertChannelExists(scope);
    const [instructions, aiModels, videoModel] = await Promise.all([
      this.resolvePlanInstructions(scope),
      this.settings.getAiModels(scope),
      this.videoModelPrompts.getPromptDescriptor(),
    ]);
    // 세그먼트는 실제 조립과 같은 배열이어야 화면이 진짜 나가는 프롬프트를 보여준다.
    return this.processViews[scope.version].build({
      instructions,
      imageModel: imageModelForVersion(scope.version, aiModels.image),
      briefRefinerLlm: pipelineFor(scope.version).briefRefinerLlm,
      segments: this.prompts[scope.version].segments(),
      videoModel,
    });
  }

  /**
   * 이번 생성에 쓸 브랜드/컨셉 확정. 세트는 시작점이고 요청이 보낸 조합이 최종
   * 세트를 고치지 않으므로 다음 생성은 다시 세트 조합에서 시작한다.
   * 문구(label/note)는 요청이 아니라 카탈로그에서 채움: 화면과 모델이 다른 문구를 보는 것과
   * 문구를 통한 임의 지시 주입 방지
   */
  private async resolveBrand(
    scope: OwnerVersionScope,
    brandName: string,
    override?: ConceptChoice[],
  ): Promise<{ brandName: string; brandDescription: string; concepts: ConceptSelection[] }> {
    // 브랜드 없는 경로(프롬프트 입력 방식): 저장된 세트를 조회하지 않음. 고를 세트가 없어
    // 없는 이름으로 조회하면 NotFound 고, 주제도 연출도 씬 입력 본문에서 나온다(`hasBrand` 판정)
    if (!brandName) {
      return { brandName: '', brandDescription: '', concepts: [] };
    }
    const brandSets = await this.settings.getBrandConceptSets(scope);
    const brand = brandSets.find((b) => b.brandName === brandName);
    if (!brand) {
      throw new NotFoundException('브랜드/컨셉을 찾을 수 없습니다.');
    }
    if (!override || override.length === 0) {
      return brand;
    }
    // 문구는 그 세트의 커스텀 정의까지 아는 해석기로 푼다. 세트가 스스로 더한 카테고리는 정의가
    // 세트 안에만 있어 카탈로그만 보는 해석으로는 그 선택이 통째로 거절됨
    const resolve = createConceptResolver(brand);
    // 축마다 하나만 남김(뒤에 온 것이 이김). 같은 축이 두 번 오면 프롬프트에 상반된 지시가 실림
    const byAxis = new Map<string, ConceptSelection>();
    for (const c of override) {
      const text = resolve(c.axis, c.option);
      if (!text) {
        // 커스텀 정의가 풀리지 않으면 그 항목만 버린다. 커스텀 카테고리는 언제든 지워지는데
        // 세우면 하나 지웠다고 옛 기획안의 이미지 재생성이 영구히 막힘
        // (버려도 안전한 근거는 씬 이미지가 style/mood 만 집어 화풍 앵커가 흔들리지 않는다는 것)
        if (isCustomConceptKey(c.axis) || isCustomConceptKey(c.option)) {
          this.logger.warn(
            `없어진 커스텀 컨셉을 건너뛴다: ${c.axis}/${c.option} (브랜드: ${brandName})`,
          );
          continue;
        }
        // 기본 축/옵션이 풀리지 않는 것은 클라이언트 오타, 조용히 넘기지 않음
        throw new BadRequestException(`선택지에 없는 컨셉입니다: ${c.axis}/${c.option}`);
      }
      byAxis.set(c.axis, {
        axis: c.axis,
        option: c.option,
        label: text.label,
        note: text.note,
        ...(text.axisLabel ? { axisLabel: text.axisLabel } : {}),
      });
    }
    return { ...brand, concepts: [...byAxis.values()] };
  }

  /**
   * 채널 소유 검증, 부재 시 NotFound
   * 채널이 개인 소유가 되며 "있는가"가 아니라 "그 사람 것인가"를 묻는다. 없는 채널과 남의 채널이
   * 같은 응답을 받아 존재를 알려주지 않음
   */
  private async requireChannel(scope: WorkspaceScope) {
    const channel = await this.channels.getChannel(
      scope.organizationId,
      scope.ownerUserId,
      scope.channelId,
    );
    if (!channel) {
      throw new NotFoundException('채널을 찾을 수 없습니다.');
    }
    return channel;
  }

  private async assertChannelExists(scope: WorkspaceScope): Promise<void> {
    await this.requireChannel(scope);
  }
}
