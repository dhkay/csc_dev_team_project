import type { ProvisioningMode } from '@csc/entitlements';

/** AI 도구 카탈로그 항목: user 서버 /internal/ai-tools 응답과 동일 형태. key 고정, name/slug/프로비저닝 편집 가능 */
export interface AiToolCatalogItem {
  key: string;
  name: string;
  slug: string;
  description: string | null;
  // 프로비저닝 모드: PER_ORG(조직 개별 부여) | COMMON(전 조직 공통 제공)
  provisioning: ProvisioningMode;
  isActive: boolean;
  sortOrder: number;
}
