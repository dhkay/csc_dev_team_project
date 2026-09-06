import { Module } from '@nestjs/common';
import { VideoProjectModule } from '../video-project/video-project.module';
import { AssetSetModule } from '../asset-set/asset-set.module';
import { MarketingServiceTokenService } from '../../shared/adapters/outbound/service-token';
import { ActivityLogModule } from '../../shared/adapters/outbound/log-server-api';
import { VideoModelApiClientService } from '../../shared/adapters/outbound/video-model-api';
import {
  FileUploadApiClientService,
  FileUploadStorageAdapter,
} from '../../shared/adapters/outbound/file-upload-api';
import { FILE_UPLOAD_STORAGE_PORT } from '../../shared/domain/storage';
import { VideoFinalController } from './adapters/inbound/http/controllers';
import { VideoFinalService } from './core/application/services';
import { VideoFinalRepositoryAdapter } from './adapters/outbound/db/marketingdb';
import { FinalRenderAdapter } from './adapters/outbound/http/video-model-api';
import { VIDEO_FINAL_PORT } from './core/application/ports/inbound';
import {
  FinalRenderSpecBuilder,
  FINAL_RENDER_PORT,
  FINAL_RENDER_SPEC_BUILDERS,
  VIDEO_FINAL_REPOSITORY_PORT,
} from './core/application/ports/outbound';
import { MarketingSagaModule } from '../../shared/saga.module';
import { CreateVideoFinalSaga, RerenderVideoFinalSaga } from './core/application/sagas';
import { DefaultFinalRenderSpecBuilder } from './core/application/spec/final-render-spec-builder';
import type { VersionRegistry } from '../../shared/domain/version-registry';

@Module({
  // VIDEO_PROJECT_PORT(원천 영상 조회) + ASSET_SET_PORT(세트 frame/outro 해석)를 각 모듈에서 주입받는다.
  // ActivityLogModule: 활동 원장 기록(프로듀서 싱글톤 공유)
  // SagaModule: 최종 영상 생성/재렌더는 다단계 쓰기라 오케스트레이터에 위임한다.
  imports: [VideoProjectModule, AssetSetModule, ActivityLogModule, MarketingSagaModule],
  controllers: [VideoFinalController],
  providers: [
    // Inbound Port → Service
    { provide: VIDEO_FINAL_PORT, useClass: VideoFinalService },
    // Outbound Port → Adapter (Drizzle marketingdb)
    { provide: VIDEO_FINAL_REPOSITORY_PORT, useClass: VideoFinalRepositoryAdapter },
    // Outbound Port → Adapter (video-model FINALIZE 렌더 잡 등록/조회)
    { provide: FINAL_RENDER_PORT, useClass: FinalRenderAdapter },
    // Outbound Port → 공유 file-upload 스토리지(렌더 등록 전 자산 사전검증)
    { provide: FILE_UPLOAD_STORAGE_PORT, useClass: FileUploadStorageAdapter },
    // 사가 정의: 이 도메인이 소유한다. 복구 러너가 모으므로 export 한다.
    CreateVideoFinalSaga,
    DefaultFinalRenderSpecBuilder,
    // 버전별 최종 합성 스펙 조립(파이프라인 이음새 3/3)
    // 지금은 두 버전이 같은 구현을 가리킴. 갈리는 날 그 버전용 클래스를 만들어 여기 한 줄만 바꿈
    {
      provide: FINAL_RENDER_SPEC_BUILDERS,
      inject: [DefaultFinalRenderSpecBuilder],
      useFactory: (shared: DefaultFinalRenderSpecBuilder) =>
        ({ 'v1.5': shared, 'v1.0': shared }) satisfies VersionRegistry<FinalRenderSpecBuilder>,
    },
    RerenderVideoFinalSaga,
    VideoModelApiClientService, // video-model 타깃 공유 클라이언트(싱글톤)
    FileUploadApiClientService, // file-upload 타깃 공유 클라이언트(싱글톤)
    MarketingServiceTokenService, // 이 앱의 서비스 토큰(타깃 무관: 신원은 하나)
  ],
  // 복구 러너가 사가 정의를 모은다.
  // 사가 정의는 복구 러너가 모으므로 export 한다(SagaRecoveryModule)
  exports: [CreateVideoFinalSaga, RerenderVideoFinalSaga],
})
export class VideoFinalModule {}
