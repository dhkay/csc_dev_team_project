import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  AI_TOOL_CATALOG,
  ALL_AI_TOOL_KEYS,
  ALL_FEATURE_KEYS,
  ALL_PERMISSION_KEYS,
  FEATURE_CATALOG,
  PERMISSION_CATALOG,
} from '../core/domain/types/entitlement-catalog';
import {
  CATALOG_SEED_REPOSITORY_PORT,
  CatalogSeedRepositoryPort,
} from '../core/application/ports/outbound/catalog-seed-repository.port';

/**
 * 엔타이틀먼트 카탈로그 시더: 코드 카탈로그(SSOT)를 userdb features/ai_tools 에 멱등 동기화한다.
 * 부팅 시 누락 key 삽입(표시명/slug 보존) + 코드에서 사라진 key 비활성화(soft)
 * 이 덕분에 새 기능/AI도구 추가는 enum + 시드 한 줄로 끝난다(시드 전용 마이그레이션 불필요)
 *
 * AdminSeederService 와 동일하게 best-effort: 어떤 실패도 부팅을 죽이지 않는다(로그만)
 * 설계: .claude/rules/multi-tenancy.md
 */
@Injectable()
export class CatalogSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogSeederService.name);

  constructor(
    @Inject(CATALOG_SEED_REPOSITORY_PORT)
    private readonly catalog: CatalogSeedRepositoryPort,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const [newAiTools, newFeatures, newPermissions] = await Promise.all([
        this.catalog.insertMissingAiTools(AI_TOOL_CATALOG),
        this.catalog.insertMissingFeatures(FEATURE_CATALOG),
        this.catalog.insertMissingPermissions(PERMISSION_CATALOG),
      ]);
      const [staleAiTools, staleFeatures, stalePermissions] = await Promise.all([
        this.catalog.deactivateAiToolsNotIn(ALL_AI_TOOL_KEYS),
        this.catalog.deactivateFeaturesNotIn(ALL_FEATURE_KEYS),
        this.catalog.deactivatePermissionsNotIn(ALL_PERMISSION_KEYS),
      ]);

      const changes = [
        newAiTools.length && `AI도구 추가 [${newAiTools.join(', ')}]`,
        newFeatures.length && `기능 추가 [${newFeatures.join(', ')}]`,
        newPermissions.length && `권한 추가 [${newPermissions.join(', ')}]`,
        staleAiTools.length && `AI도구 비활성화 [${staleAiTools.join(', ')}]`,
        staleFeatures.length && `기능 비활성화 [${staleFeatures.join(', ')}]`,
        stalePermissions.length && `권한 비활성화 [${stalePermissions.join(', ')}]`,
      ].filter(Boolean);

      this.logger.log(
        changes.length ? `카탈로그 동기화: ${changes.join(', ')}` : '카탈로그 동기화: 변경 없음',
      );
    } catch (err) {
      this.logger.error(
        `카탈로그 시드 실패(부팅은 계속한다): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
