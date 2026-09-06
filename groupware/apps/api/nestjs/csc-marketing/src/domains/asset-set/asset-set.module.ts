import { Module } from '@nestjs/common';
import { AssetSetController } from './adapters/inbound/http/controllers';
import { AssetSetService } from './core/application/services';
import { AssetSetRepositoryAdapter } from './adapters/outbound/db/marketingdb';
import {
  FileUploadApiClientService,
  FileUploadStorageAdapter,
} from '../../shared/adapters/outbound/file-upload-api';
import { MarketingServiceTokenService } from '../../shared/adapters/outbound/service-token';
import { FILE_UPLOAD_STORAGE_PORT } from '../../shared/domain/storage';
import { ASSET_SET_PORT } from './core/application/ports/inbound';
import { ASSET_SET_REPOSITORY_PORT } from './core/application/ports/outbound';

@Module({
  controllers: [AssetSetController],
  providers: [
    // Inbound Port → Service
    { provide: ASSET_SET_PORT, useClass: AssetSetService },
    // Outbound Port → Adapter (Drizzle marketingdb: 자기완결 세트, 전역 common)
    { provide: ASSET_SET_REPOSITORY_PORT, useClass: AssetSetRepositoryAdapter },
    // Outbound Port → 공유 file-upload 스토리지(슬롯 바이트 삭제)
    { provide: FILE_UPLOAD_STORAGE_PORT, useClass: FileUploadStorageAdapter },
    FileUploadApiClientService, // file-upload 타깃 공유 클라이언트(싱글톤)
    MarketingServiceTokenService, // 이 앱의 서비스 토큰(타깃 무관: 신원은 하나)
  ],
  // video-final 이 세트(frame/outro) 해석을 위해 주입
  exports: [ASSET_SET_PORT],
})
export class AssetSetModule {}
