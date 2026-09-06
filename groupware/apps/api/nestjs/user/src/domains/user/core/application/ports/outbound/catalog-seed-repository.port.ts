import {
  AiToolCatalogSeed,
  AiToolKey,
  CatalogSeed,
  FeatureKey,
  PermissionKey,
} from '../../../domain/types/entitlement-catalog';

/**
 * 카탈로그 시드 아웃바운드 포트: 코드 카탈로그(SSOT)를 userdb 의 features/ai_tools 테이블에
 * 멱등 동기화한다. CatalogSeederService 가 부팅 시 호출한다.
 *
 * 정책:
 *  - insertMissing*: 코드에 있으나 DB 에 없는 key 만 삽입(ON CONFLICT DO NOTHING)
 *    기존 행의 표시명/slug 는 플랫폼 편집이 우선이므로 덮어쓰지 않는다.
 *  - deactivate*NotIn: 코드에 없는 key 행을 비활성화(soft, is_active=false). 행/grant 는 보존(비파괴)
 */
export interface CatalogSeedRepositoryPort {
  /** 누락된 AI도구 key 삽입(provisioning 기본값 포함): 반환: 새로 삽입된 key. */
  insertMissingAiTools(seeds: AiToolCatalogSeed[]): Promise<string[]>;
  /** 누락된 기능 key 삽입: 반환: 새로 삽입된 key. */
  insertMissingFeatures(seeds: CatalogSeed<FeatureKey>[]): Promise<string[]>;
  /** 누락된 권한 key 삽입: 반환: 새로 삽입된 key. */
  insertMissingPermissions(seeds: CatalogSeed<PermissionKey>[]): Promise<string[]>;
  /** keys 에 없는 활성 AI도구 행을 비활성화: 반환: 비활성화된 key. */
  deactivateAiToolsNotIn(keys: AiToolKey[]): Promise<string[]>;
  /** keys 에 없는 활성 기능 행을 비활성화: 반환: 비활성화된 key. */
  deactivateFeaturesNotIn(keys: FeatureKey[]): Promise<string[]>;
  /** keys 에 없는 활성 권한 행을 비활성화: 반환: 비활성화된 key. */
  deactivatePermissionsNotIn(keys: PermissionKey[]): Promise<string[]>;
}

export const CATALOG_SEED_REPOSITORY_PORT = Symbol('CATALOG_SEED_REPOSITORY_PORT');
