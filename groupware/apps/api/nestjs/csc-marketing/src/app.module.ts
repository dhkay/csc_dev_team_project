import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { MarketingSagaRecoveryModule } from './shared/saga-recovery/saga-recovery.module';
import { ServiceTokenGuard } from '@csc/net-utils/nest';
import { AssetCatalogModule } from './domains/asset-catalog/asset-catalog.module';
import { AssetSetModule } from './domains/asset-set/asset-set.module';
import { ChannelModule } from './domains/channel/channel.module';
import { ChannelSettingsModule } from './domains/channel-settings/channel-settings.module';
import { CommonAssetModule } from './domains/common-asset/common-asset.module';
import { PlanGenerationModule } from './domains/plan-generation/plan-generation.module';
import { SavedPlanModule } from './domains/saved-plan/saved-plan.module';
import { VideoProjectModule } from './domains/video-project/video-project.module';
import { VideoFinalModule } from './domains/video-final/video-final.module';

/**
 * 루트 DI 조립: csc 마케팅 API (영상 기획안 도메인)
 * 도메인은 src/domains/<domain>/ 에 헥사곤 1개씩 추가하고 여기 imports 에 등록한다.
 *
 * 보안 Layer 3: ServiceTokenGuard 를 전역 가드로 등록: 모든 엔드포인트가 X-Service-Token 검증을 거친다.
 * 조직 스코프(organizationId)는 신뢰된 호출자(web-groupware BFF)가 명시 전달한다(file-upload/media 와 동일 모델)
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AssetCatalogModule,
    AssetSetModule,
    // 마케팅영상 도구의 채널 계열 4개: 채널(맥락) → 단어/설정 → 기획서 생성
    //   의존 방향이 이 순서 한쪽이라 순환이 없다.
    ChannelModule,
    ChannelSettingsModule,
    PlanGenerationModule,
    CommonAssetModule,
    SavedPlanModule,
    VideoProjectModule,
    VideoFinalModule,
    // 사가 복구: 중단된 다단계 쓰기를 주기적으로 이어 간다(오케스트레이션의 복구 조각)
    //   ScheduleModule 은 이 앱의 유일한 스케줄러 사용처다(복구 틱)
    ScheduleModule.forRoot(),
    MarketingSagaRecoveryModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ServiceTokenGuard }],
})
export class AppModule {}
