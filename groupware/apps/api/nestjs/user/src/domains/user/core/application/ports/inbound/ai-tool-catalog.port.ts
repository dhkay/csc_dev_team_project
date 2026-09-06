import { AiToolCatalogItem } from '../../../domain/types';
import { ProvisioningMode } from '../../../domain/types/entitlement-catalog';

/** AI 도구 카탈로그 수정 입력: 표시명/slug/프로비저닝(제공된 필드만). key/enum 고정 */
export interface UpdateAiToolInput {
  name?: string;
  slug?: string;
  provisioning?: ProvisioningMode;
}

/**
 * AI 도구 카탈로그 Inbound Port: 플랫폼(csc-control-tower)이 표시명/slug 를 관리한다.
 * 추가/삭제 없음(enum 고정): 조회 + 수정만
 */
export interface AiToolCatalogPort {
  listAiToolCatalog(): Promise<AiToolCatalogItem[]>;
  updateAiTool(key: string, patch: UpdateAiToolInput): Promise<AiToolCatalogItem>;
}

export const AI_TOOL_CATALOG_PORT = Symbol('AI_TOOL_CATALOG_PORT');
