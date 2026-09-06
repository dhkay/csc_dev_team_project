// 개인 브랜드/컨셉 세트 조회 레이어: TanStack Query.
// 채널 키가 없다(세트가 채널에 매달려 있지 않다) → enabled 가드도 필요 없다: 로그인해 있으면 항상 조회
import { queryOptions } from '@tanstack/svelte-query';
import type { BrandConceptSet } from '../types';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import * as api from '../apis/brandConceptApi';

/**
 * 쿼리 키 팩토리: 내 브랜드/컨셉 세트(단일)
 *
 * 키가 버전을 나른다. 그래서 버전을 바꿀 때 무효화할 것이 없다(다른 키 공간이라 서로를 못 본다)
 * 키에 버전이 없으면 전환마다 무효화 목록을 손으로 유지해야 하고, 그 목록에서 빠진 자원이 직전
 * 버전의 값을 그대로 보여준다.
 */
export const brandConceptKeys = {
  // 이 버전 슬롯의 세트 목록. 두 버전은 연출 방향을 공유하지 않는다.
  mine: (version: VersionMode) => ['marketing-my-brand-concept', version] as const,
};

export function myBrandConceptQueryOptions(version: VersionMode) {
  return queryOptions({
    queryKey: brandConceptKeys.mine(version),
    queryFn: async (): Promise<BrandConceptSet[]> => {
      const res = await api.getMyBrandConcept(version);
      if (!res.success) {
        throw new Error(res.error ?? '브랜드/컨셉을 불러오지 못했습니다.');
      }
      return res.data;
    },
  });
}
