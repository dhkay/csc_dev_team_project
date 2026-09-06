// AI 도구 카탈로그(ai-tools) BFF 엔드포인트 타입 계약: 표시명/slug 수정(PATCH :key)
import { defineRoute } from '$lib/infrastructure/http/bffClient';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { AiToolCatalogItem, UpdateAiToolInput } from './types';

export const aiToolsContract = {
  update: defineRoute<UpdateAiToolInput, AiToolCatalogItem, { key: string }>('PATCH', (p) =>
    ROUTES.PLATFORM.aiToolCatalog(p.key)
  )
};
