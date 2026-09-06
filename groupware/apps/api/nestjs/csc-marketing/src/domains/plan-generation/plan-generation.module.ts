import { Module } from '@nestjs/common';
import { ChannelModule } from '../channel/channel.module';
import { ChannelSettingsModule } from '../channel-settings/channel-settings.module';
import { CommonAssetModule } from '../common-asset/common-asset.module';
import {
  PlanGenerationController,
  ImageEngineLoadController,
} from './adapters/inbound/http/controllers';
import { PlanGenerationService } from './core/application/services';
import {
  LanguageModelPlanGeneratorV10Adapter,
  LanguageModelPlanGeneratorV15Adapter,
} from './adapters/outbound/plan-generator';
import { LanguageModelPlanImageGeneratorAdapter } from './adapters/outbound/plan-image-generator';
import { LanguageModelFocusKeywordGeneratorAdapter } from './adapters/outbound/focus-keyword-generator';
import { LanguageModelBriefRefinerAdapter } from './adapters/outbound/brief-refiner';
import { VideoModelPromptAdapter } from './adapters/outbound/http/video-model-api';
import { ActivityLogModule } from '../../shared/adapters/outbound/log-server-api';
import { LanguageModelApiClientService } from '../../shared/adapters/outbound/language-model-api';
import { VideoModelApiClientService } from '../../shared/adapters/outbound/video-model-api';
import { MarketingServiceTokenService } from '../../shared/adapters/outbound/service-token';
import { PLAN_GENERATION_PORT } from './core/application/ports/inbound';
import {
  PlanGeneratorPort,
  PlanPromptAssembler,
  PlanProcessViewBuilder,
  PLAN_GENERATORS,
  PLAN_IMAGE_GENERATOR_PORT,
  PLAN_PROCESS_VIEWS,
  PLAN_PROMPT_ASSEMBLERS,
  FOCUS_KEYWORD_GENERATOR_PORT,
  BRIEF_REFINER_PORT,
  VIDEO_MODEL_PROMPT_PORT,
} from './core/application/ports/outbound';
import {
  PLAN_PROMPT_ASSEMBLER_V10,
  PLAN_PROMPT_ASSEMBLER_V15,
} from './core/domain/prompt';
import {
  PLAN_PROCESS_VIEW_V10,
  PLAN_PROCESS_VIEW_V15,
} from './core/domain/process';
import type { VersionRegistry } from '../../shared/domain/version-registry';

/**
 * 기획서 생성 도메인: 프롬프트 조립 규칙과 그 결과(기획안/씬 이미지/프롬프트 뷰)
 *
 * 목적 키워드는 요청에 실려 오고(저장하지 않는다), 브랜드/컨셉과 AI 모델과 편집 지침과 소스
 * 인사이트는 ChannelSettingsModule 에서 온다. 방향은 기획 → 재료 한쪽이라 순환이 없다.
 */
@Module({
  imports: [
    ChannelModule,
    ChannelSettingsModule,
    CommonAssetModule,
    ActivityLogModule,
  ],
  controllers: [PlanGenerationController, ImageEngineLoadController],
  providers: [
    { provide: PLAN_GENERATION_PORT, useClass: PlanGenerationService },
    // 버전별 프롬프트 파이프라인(이음새 1/3). 새 버전 = 여기 한 줄
    //   `VersionRegistry` 가 exhaustive 라, ToolVersion 에 값을 더하고 이 표를 안 채우면 컴파일이
    //   막는다(런타임에 undefined 로 그 버전에서만 조용히 터지지 않는다)
    {
      provide: PLAN_PROMPT_ASSEMBLERS,
      useValue: {
        'v1.5': PLAN_PROMPT_ASSEMBLER_V15,
        'v1.0': PLAN_PROMPT_ASSEMBLER_V10,
      } satisfies VersionRegistry<PlanPromptAssembler>,
    },
    // 버전별 기획서 생성(파이프라인 이음새). 새 버전 = 여기 한 줄
    //
    // 조립기와 갈린 근거가 같다: 두 버전의 산출물 형태가 다르면(기획안 여러 개 vs 영상 한 편)
    //   응답 스키마도, 출력 토큰 예산도, 다양성도 함께 갈린다. 한 어댑터가 두 스키마를 다
    //   읽던 동안 한쪽의 필드 폴백이 다른 쪽 결과에 걸렸고, 그것은 결과물을 열어야 드러났다.
    LanguageModelPlanGeneratorV10Adapter,
    LanguageModelPlanGeneratorV15Adapter,
    {
      provide: PLAN_GENERATORS,
      inject: [LanguageModelPlanGeneratorV10Adapter, LanguageModelPlanGeneratorV15Adapter],
      useFactory: (
        v10: LanguageModelPlanGeneratorV10Adapter,
        v15: LanguageModelPlanGeneratorV15Adapter,
      ) => ({ 'v1.5': v15, 'v1.0': v10 }) satisfies VersionRegistry<PlanGeneratorPort>,
    },
    // 버전별 프로세스 뷰(파이프라인 이음새). 새 버전 = 여기 한 줄
    //   조립기와 같은 이유로 표에 둔다: 그 버전이 무엇을 어떤 순서로 하는지는 버전의 사실이고,
    //   한 함수가 삼항으로 갈랐을 때는 두 버전의 산문이 한 파일에서 나란히 살았다.
    {
      provide: PLAN_PROCESS_VIEWS,
      useValue: {
        'v1.5': PLAN_PROCESS_VIEW_V15,
        'v1.0': PLAN_PROCESS_VIEW_V10,
      } satisfies VersionRegistry<PlanProcessViewBuilder>,
    },
    // 씬 이미지 생성: 채널 선택 이미지 모델로 language-model 서비스 호출
    { provide: PLAN_IMAGE_GENERATOR_PORT, useClass: LanguageModelPlanImageGeneratorAdapter },
    // 포커스 키워드 후보 생성: 같은 language-model 클라이언트를 재사용한다.
    {
      provide: FOCUS_KEYWORD_GENERATOR_PORT,
      useClass: LanguageModelFocusKeywordGeneratorAdapter,
    },
    // 입력 정제(기획 앞): 어댑터는 하나다. 응답 스키마가 이 도메인의 것이라 버전과 무관하고,
    //   갈리는 것(무엇을 물을지, 어느 버전이 정제하는지)은 조립기와 파이프라인 표가 이미 갖고 있다.
    { provide: BRIEF_REFINER_PORT, useClass: LanguageModelBriefRefinerAdapter },
    LanguageModelApiClientService, // language-model 타깃 공유 클라이언트(싱글톤)
    // 프로세스 뷰의 원천 영상 프롬프트: 원문 주인인 video-model 이 서빙
    { provide: VIDEO_MODEL_PROMPT_PORT, useClass: VideoModelPromptAdapter },
    VideoModelApiClientService, // video-model 타깃 공유 클라이언트(싱글톤)
    MarketingServiceTokenService, // 이 앱의 서비스 토큰(타깃 무관: 신원은 하나)
  ],
})
export class PlanGenerationModule {}
