// 브랜드/컨셉 선택지 조회 레이어: TanStack Query.
// 카탈로그는 배포로만 바뀌는 정적 데이터라 staleTime 을 길게 둔다(화면 이동마다 재조회하지 않는다)
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/brandConceptCatalogApi';
import type { BrandConceptAxis } from '../types';

const STALE_MS = 30 * 60 * 1000;

export const brandConceptCatalogKeys = {
  axes: () => ['marketing-brand-concept-catalog'] as const,
};

export function brandConceptCatalogQueryOptions() {
  return queryOptions({
    queryKey: brandConceptCatalogKeys.axes(),
    staleTime: STALE_MS,
    queryFn: async (): Promise<BrandConceptAxis[]> => {
      const res = await api.getBrandConceptCatalog();
      if (!res.success) {
        throw new Error(res.error ?? '브랜드/컨셉 선택지를 불러오지 못했습니다.');
      }
      return res.data;
    },
  });
}
