import { Module } from '@nestjs/common';
import { ChannelSettingsModule } from '../channel-settings/channel-settings.module';
import { SavedPlanModule } from '../saved-plan/saved-plan.module';
import { MarketingServiceTokenService } from '../../shared/adapters/outbound/service-token';
import { VideoModelApiClientService } from '../../shared/adapters/outbound/video-model-api';
import { GroupwareApiClientService } from '../../shared/adapters/outbound/groupware-api';
import { ActivityLogModule } from '../../shared/adapters/outbound/log-server-api';
import {
  FileUploadApiClientService,
  FileUploadStorageAdapter,
} from '../../shared/adapters/outbound/file-upload-api';
import { FILE_UPLOAD_STORAGE_PORT } from '../../shared/domain/storage';
import { JobCredentialCipher } from '../../shared/crypto';
import { VideoProjectController } from './adapters/inbound/http/controllers';
import { VideoProjectService } from './core/application/services';
import { VideoProjectRepositoryAdapter } from './adapters/outbound/db/marketingdb';
import { VideoRenderAdapter } from './adapters/outbound/http/video-model-api';
import { ApiCredentialResolverAdapter } from './adapters/outbound/http/groupware-api';
import { VIDEO_PROJECT_PORT } from './core/application/ports/inbound';
import {
  API_CREDENTIAL_RESOLVER_PORT,
  VIDEO_PROJECT_REPOSITORY_PORT,
  VideoRenderSpecBuilder,
  VIDEO_RENDER_PORT,
  VIDEO_RENDER_SPEC_BUILDERS,
} from './core/application/ports/outbound';
import type { VersionRegistry } from '../../shared/domain/version-registry';
import { MarketingSagaModule } from '../../shared/saga.module';
import {
  CreateVideoProjectSaga,
  RerenderVideoProjectSaga,
  RerenderVideoProjectSegmentSaga,
  VideoProjectSpecBuilder,
} from './core/application/sagas';

@Module({
  // SAVED_PLAN_PORT(저장본 스냅샷), CHANNEL_SETTINGS_PORT(AI 모델 선택), 활동 원장, 사가 오케스트레이터
  imports: [SavedPlanModule, ChannelSettingsModule, ActivityLogModule, MarketingSagaModule],
  controllers: [VideoProjectController],
  providers: [
    // Inbound Port → Service
    { provide: VIDEO_PROJECT_PORT, useClass: VideoProjectService },
    // Outbound Port → Adapter (Drizzle marketingdb)
    { provide: VIDEO_PROJECT_REPOSITORY_PORT, useClass: VideoProjectRepositoryAdapter },
    // Outbound Port → Adapter (video-model COMPOSE 렌더 잡)
    { provide: VIDEO_RENDER_PORT, useClass: VideoRenderAdapter },
    // Outbound Port → Adapter (csc-groupware 조직 자격증명 resolve)
    { provide: API_CREDENTIAL_RESOLVER_PORT, useClass: ApiCredentialResolverAdapter },
    // Outbound Port → 공유 file-upload 스토리지(렌더 등록 전 자산 사전검증)
    { provide: FILE_UPLOAD_STORAGE_PORT, useClass: FileUploadStorageAdapter },
    // 사가 정의 + 스펙 조립 규칙(생성과 재렌더가 공유). 복구 러너가 모으므로 정의를 export
    CreateVideoProjectSaga,
    RerenderVideoProjectSaga,
    RerenderVideoProjectSegmentSaga,
    VideoProjectSpecBuilder,
    // 버전별 원천 렌더 스펙 조립(파이프라인 이음새 2/3)
    // 지금은 두 버전이 같은 구현을 가리킴. 갈리는 날 그 버전용 클래스를 만들어 여기 한 줄만 바꿈
    {
      provide: VIDEO_RENDER_SPEC_BUILDERS,
      inject: [VideoProjectSpecBuilder],
      useFactory: (shared: VideoProjectSpecBuilder) =>
        ({ 'v1.5': shared, 'v1.0': shared }) satisfies VersionRegistry<VideoRenderSpecBuilder>,
    },
    VideoModelApiClientService, // video-model 타깃 공유 클라이언트(싱글톤)
    GroupwareApiClientService, // csc-groupware 타깃 공유 클라이언트(싱글톤)
    FileUploadApiClientService, // file-upload 타깃 공유 클라이언트(싱글톤)
    MarketingServiceTokenService, // 이 앱의 서비스 토큰(타깃 무관)
    JobCredentialCipher, // 조직 키 암호화(AES-GCM). 잡 params 주입용
  ],
  // video-final 이 원천 영상 조회를 위해 주입하고, 사가 정의는 복구 러너가 모음
  exports: [
    VIDEO_PROJECT_PORT,
    CreateVideoProjectSaga,
    RerenderVideoProjectSaga,
    RerenderVideoProjectSegmentSaga,
  ],
})
export class VideoProjectModule {}
