// 활동 로그 조회 레이어: TanStack Query(infinite). 감사 표는 "더 보기" 로 이어 붙인다.
//   자동 무한 스크롤을 쓰지 않는 이유: 감사 목록은 예측 가능하고 키보드 접근 가능한 편이 맞다.
import { infiniteQueryOptions } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import * as api from '../apis/activityLogsApi';
import type { ActivityLogCursor, ActivityLogFilter, ActivityLogPage } from '../types';

/** 쿼리 키 팩토리: 필터가 바뀌면 다른 목록이다(커서도 함께 초기화된다) */
export const activityLogsKeys = {
  all: ['marketing-activity-logs'] as const,
  infinite: (filter: ActivityLogFilter) =>
    [
      ...activityLogsKeys.all,
      'infinite',
      filter.channelId ?? null,
      filter.actorId ?? null,
      filter.since ?? null,
      filter.until ?? null,
      filter.actionPrefix ?? null,
      filter.failedOnly ?? false,
      filter.billedOnly ?? false
    ] as const
};

export function activityLogsInfiniteQueryOptions(filter: ActivityLogFilter) {
  return infiniteQueryOptions({
    queryKey: activityLogsKeys.infinite(filter),
    // SSR 에서 미리 받지 않는다. 조회가 무겁고 필터가 클라이언트 상태다.
    enabled: browser,
    initialPageParam: null as ActivityLogCursor | null,
    queryFn: async ({ pageParam }): Promise<ActivityLogPage> => {
      const res = await api.fetchActivityLogs(filter, pageParam);
      if (!res.success) {
        throw new Error(res.error ?? '활동 로그를 불러오지 못했습니다.');
      }
      return res.data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor
  });
}
