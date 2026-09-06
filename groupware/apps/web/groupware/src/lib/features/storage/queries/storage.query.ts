// 스토리지 조회 쿼리 옵션 + 캐시 키
import { browser } from '$app/environment';
import { keepPreviousData, queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/storageApi';
import type {
  StorageListing,
  StorageScope,
  StorageSortId,
  StorageUsageSummary
} from '../types';

/**
 * 키에 들어가는 축과 그 이유
 *
 * - area, departmentId: 이 둘이 다르면 다른 작업 공간이다. 빼면 영업팀에서 개발팀으로
 *   옮겼을 때 이전 부서의 목록이 캐시에서 그대로 그려진다.
 * - trashed: 휴지통과 일반 목록은 같은 조건의 다른 집합이다.
 * - sort, search: 서버가 정렬과 검색을 하므로 응답 자체가 달라진다.
 *
 * 뷰 모드(그리드/목록)와 선택 상태는 넣지 않는다. 같은 데이터의 표현일 뿐이라, 넣으면
 * 토글할 때마다 서버를 다시 부른다.
 */
export const storageKeys = {
  all: ['storage'] as const,
  listing: (
    scope: StorageScope,
    sort: StorageSortId,
    search: string,
    trashed: boolean,
    limit: number
  ) =>
    [
      'storage',
      'listing',
      scope.area,
      scope.departmentId,
      trashed,
      sort,
      search,
      limit
    ] as const,
  usage: () => ['storage', 'usage'] as const
};

export function storageListingQueryOptions(
  scope: StorageScope,
  sort: StorageSortId,
  search: string,
  trashed: boolean,
  limit: number
) {
  return queryOptions({
    queryKey: storageKeys.listing(scope, sort, search, trashed, limit),
    enabled: browser,
    // 영역이나 정렬을 바꿀 때, 그리고 더 보기로 페이지를 넓힐 때 빈 화면이 깜빡이지 않게
    // 이전 결과를 잠시 유지한다.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<StorageListing> => {
      const res = await api.listItems({ scope, sort, search, trashed, limit });
      if (!res.success) throw new Error(res.error ?? '파일 목록을 불러오지 못했습니다.');
      return res.data;
    }
  });
}

export function storageUsageQueryOptions() {
  return queryOptions({
    queryKey: storageKeys.usage(),
    enabled: browser,
    staleTime: 60_000,
    queryFn: async (): Promise<StorageUsageSummary> => {
      const res = await api.getUsage();
      if (!res.success) throw new Error(res.error ?? '사용량을 불러오지 못했습니다.');
      return res.data;
    }
  });
}
