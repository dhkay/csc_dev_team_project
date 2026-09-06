import { Module } from '@nestjs/common';
import { AssetCatalogController } from './adapters/inbound/http/controllers';
import { AssetCatalogService } from './core/application/services';
import { AssetCatalogRepositoryAdapter } from './adapters/outbound/db/marketingdb';
import { ASSET_CATALOG_PORT } from './core/application/ports/inbound';
import { ASSET_CATALOG_REPOSITORY_PORT } from './core/application/ports/outbound';

@Module({
  controllers: [AssetCatalogController],
  providers: [
    { provide: ASSET_CATALOG_PORT, useClass: AssetCatalogService },
    { provide: ASSET_CATALOG_REPOSITORY_PORT, useClass: AssetCatalogRepositoryAdapter },
  ],
})
export class AssetCatalogModule {}
