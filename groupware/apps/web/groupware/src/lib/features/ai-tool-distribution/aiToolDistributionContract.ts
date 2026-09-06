// AI도구 배포(ai-tool-distribution) BFF 엔드포인트 타입 계약: 팀(부서)/멤버에 desired key 집합 설정
import { defineRoute } from '$lib/infrastructure/http/bffClient';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { AiToolKey } from './types';

export const aiToolDistributionContract = {
  set: defineRoute<{ action: 'department' | 'member'; id: number; aiToolKeys: AiToolKey[] }, void>(
    'POST',
    ROUTES.ADMIN.AI_TOOLS
  )
};
