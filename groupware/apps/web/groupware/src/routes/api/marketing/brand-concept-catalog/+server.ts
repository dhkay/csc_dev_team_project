// 브랜드/컨셉 선택지 BFF: csc-marketing `/brand-concept-catalog` 중계
// 카탈로그의 주인은 그 값을 프롬프트에 싣는 csc-marketing 이다. 이 계층은 세션 인가만 얹고 그대로 통과시킨다.
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok } from '$lib/server/http/bff';
import { requireOrgId, mapMarketingError } from '$lib/server/marketing/bff';
import type { BrandConceptAxis } from '$lib/features/marketing-channels/types';

/** 브랜드/컨셉 선택지 조회: GET /api/marketing/brand-concept-catalog */
export async function GET(event: RequestEvent) {
  const auth = await requireOrgId(event);
  if ('error' in auth) return auth.error;

  try {
    const res = await serverMarketingClient().GET<BrandConceptAxis[]>('/brand-concept-catalog');
    return ok(res.data);
  } catch (error) {
    return mapMarketingError(error, '브랜드/컨셉 선택지를 불러오지 못했습니다.');
  }
}
