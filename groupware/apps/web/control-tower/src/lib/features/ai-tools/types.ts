import type { AiToolKey, ProvisioningMode } from '@csc/entitlements';

/** AI 도구 카탈로그 항목: csc-control-tower `/platform/ai-tools` 응답과 동일 형태. key 고정(카탈로그 SSOT) */
export interface AiToolCatalogItem {
  key: AiToolKey;
  name: string;
  // 라우팅 경로 세그먼트(예: /{orgSlug}/{slug}/...)
  slug: string;
  description: string | null;
  // 프로비저닝 모드: PER_ORG(조직 개별 부여) | COMMON(전 조직 공통 제공). 플랫폼 관리자가 토글
  provisioning: ProvisioningMode;
  isActive: boolean;
  sortOrder: number;
}

/** AI 도구 수정 입력: 표시명/slug/프로비저닝(제공된 필드만) */
export interface UpdateAiToolInput {
  name?: string;
  slug?: string;
  provisioning?: ProvisioningMode;
}
