import { Module } from '@nestjs/common';
import { ChannelSettingsModule } from '../channel-settings/channel-settings.module';
import { SavedPlanController } from './adapters/inbound/http/controllers';
import { SavedPlanService } from './core/application/services';
import { SavedPlanRepositoryAdapter } from './adapters/outbound/db/marketingdb';
import {
  FileUploadApiClientService,
  FileUploadStorageAdapter,
} from '../../shared/adapters/outbound/file-upload-api';
import { ActivityLogModule } from '../../shared/adapters/outbound/log-server-api';
import { MarketingServiceTokenService } from '../../shared/adapters/outbound/service-token';
import { FILE_UPLOAD_STORAGE_PORT } from '../../shared/domain/storage';
import { SAVED_PLAN_PORT } from './core/application/ports/inbound';
import { SAVED_PLAN_REPOSITORY_PORT } from './core/application/ports/outbound';
import { MarketingSagaModule } from '../../shared/saga.module';
import { SavePlanSaga } from './core/application/sagas';

@Module({
  // CHANNEL_SETTINGS_PORT(AI 모델 선택 해석: 저장 시 llm/image 스냅샷)를 채널 모듈에서 주입받는다.
  // ActivityLogModule: 활동 원장 기록(프로듀서 싱글톤을 도메인들이 공유)
  // SagaModule: 저장은 다단계 쓰기라 오케스트레이터에 위임한다(단계/보상은 SavePlanSaga)
  imports: [ChannelSettingsModule, ActivityLogModule, MarketingSagaModule],
  controllers: [SavedPlanController],
  providers: [
    // Inbound Port → Service
    { provide: SAVED_PLAN_PORT, useClass: SavedPlanService },
    // Outbound Port → Adapter (Drizzle marketingdb)
    { provide: SAVED_PLAN_REPOSITORY_PORT, useClass: SavedPlanRepositoryAdapter },
    // Outbound Port → 공유 file-upload 스토리지(씬 이미지 삭제 cascade)
    { provide: FILE_UPLOAD_STORAGE_PORT, useClass: FileUploadStorageAdapter },
    FileUploadApiClientService, // file-upload 타깃 공유 클라이언트(싱글톤)
    // 사가 정의: 이 도메인이 소유한다(엔진은 도메인을 모른다). 복구 러너가 모으므로 export 한다.
    SavePlanSaga,
    MarketingServiceTokenService, // 이 앱의 서비스 토큰(타깃 무관: 신원은 하나)
  ],
  // video-project 도메인이 저장본을 스냅샷할 때 SAVED_PLAN_PORT.getPersonal 로 읽는다.
  exports: [SAVED_PLAN_PORT, SavePlanSaga],
})
export class SavedPlanModule {}
