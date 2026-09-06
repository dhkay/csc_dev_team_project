import type { ProvisioningMode } from '@csc/entitlements';
import { AiToolCatalogItem } from '../../../domain/ai-tool.types';

/** AI 도구 카탈로그 수정 입력: 표시명/slug/프로비저닝. key/enum 고정 */
export interface UpdateAiToolInput {
  name?: string;
  slug?: string;
  provisioning?: ProvisioningMode;
}

/**
 * AI 도구 카탈로그 Inbound Port (control-tower): 플랫폼 관리자가 표시명/slug 관리
 * userdb 소유라 user 서버에 위임한다(소유권). 추가/삭제 없음(enum 고정)
 */
export interface AiToolCatalogPort {
  listAiToolCatalog(): Promise<AiToolCatalogItem[]>;
  updateAiTool(key: string, patch: UpdateAiToolInput): Promise<AiToolCatalogItem>;
}

export const AI_TOOL_CATALOG_PORT = Symbol('PLATFORM_AI_TOOL_CATALOG_PORT');
