import { Module } from '@nestjs/common';
import { CommonAssetController } from './adapters/inbound/http/controllers';
import { CommonAssetService } from './core/application/services';
import { CommonAssetRepositoryAdapter } from './adapters/outbound/db/marketingdb';
import {
  FileUploadApiClientService,
  FileUploadStorageAdapter,
} from '../../shared/adapters/outbound/file-upload-api';
import { MarketingServiceTokenService } from '../../shared/adapters/outbound/service-token';
import { FILE_UPLOAD_STORAGE_PORT } from '../../shared/domain/storage';
import { COMMON_ASSET_PORT } from './core/application/ports/inbound';
import { COMMON_ASSET_REPOSITORY_PORT } from './core/application/ports/outbound';

@Module({
  controllers: [CommonAssetController],
  providers: [
    // Inbound Port → Service
    { provide: COMMON_ASSET_PORT, useClass: CommonAssetService },
    // Outbound Port → Adapter (Drizzle marketingdb: 전역, org 무관)
    { provide: COMMON_ASSET_REPOSITORY_PORT, useClass: CommonAssetRepositoryAdapter },
    // Outbound Port → 공유 file-upload 스토리지(바이트 삭제 cascade)
    { provide: FILE_UPLOAD_STORAGE_PORT, useClass: FileUploadStorageAdapter },
    FileUploadApiClientService, // file-upload 타깃 공유 클라이언트(싱글톤)
    MarketingServiceTokenService, // 이 앱의 서비스 토큰(타깃 무관: 신원은 하나)
  ],
  // channel 도메인이 기획 생성 시 BGM/효과음 후보를 읽는다(COMMON_ASSET_PORT.list)
  exports: [COMMON_ASSET_PORT],
})
export class CommonAssetModule {}
