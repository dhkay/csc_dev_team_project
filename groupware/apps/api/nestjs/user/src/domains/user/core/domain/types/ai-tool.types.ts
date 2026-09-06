import { ProvisioningMode } from './entitlement-catalog';

/**
 * AI 도구 카탈로그: 플랫폼 관리 메타데이터(표시명/slug/프로비저닝). key 는 고정(enum), 나머지는 편집 가능
 * 엔타이틀먼트 설계: .claude/rules/multi-tenancy.md
 */
export interface AiToolCatalogItem {
  key: string;
  name: string;
  // 라우팅 경로 세그먼트(예: /{orgSlug}/{slug}/...): key 와 별개로 가변
  slug: string;
  description: string | null;
  // 프로비저닝 모드: PER_ORG(조직 개별 부여) | COMMON(전 조직 공통 제공). 플랫폼 관리자가 토글
  provisioning: ProvisioningMode;
  isActive: boolean;
  sortOrder: number;
}

/** 조직에 부여된(resolved) AI 도구: 그룹웨어 노출/라우팅용(표시명+slug 포함) */
export interface AiToolResolved {
  key: string;
  name: string;
  slug: string;
}
