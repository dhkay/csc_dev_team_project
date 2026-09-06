// 활동 로그 데이터 접근(브라우저). 같은 origin BFF(/api/marketing/activity-logs)를 frontClient 로 호출
//   조직/권한 스코프는 BFF 가 세션에서 확정한다(브라우저는 필터만 보낸다)
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import { run, type ApiResult } from '$lib/infrastructure/http/apiResult';
import type { ActivityLogCursor, ActivityLogFilter, ActivityLogPage } from '../types';

const BASE = ROUTES.MARKETING.ACTIVITY_LOGS;

/** 필터 + 커서 → 쿼리스트링. 빈 값은 아예 보내지 않는다(BFF 가 '미지정'으로 다룬다) */
function toQuery(
  filter: ActivityLogFilter,
  cursor: ActivityLogCursor | null,
  limit?: number
): string {
  const q = new URLSearchParams();
  if (filter.channelId) q.set('channelId', String(filter.channelId));
  if (filter.actorId) q.set('actorId', String(filter.actorId));
  if (filter.since) q.set('since', filter.since);
  if (filter.until) q.set('until', filter.until);
  if (filter.actionPrefix) q.set('actionPrefix', filter.actionPrefix);
  if (filter.failedOnly) q.set('failedOnly', 'true');
  if (filter.billedOnly) q.set('billedOnly', 'true');
  // 커서는 (시각, id) 쌍으로만 유효하다. 한쪽만 보내면 페이지 경계가 어긋난다.
  if (cursor) {
    q.set('cursorAt', cursor.at);
    q.set('cursorId', cursor.id);
  }
  // 페이지 크기. 화면은 기본값(BFF 소유)을 쓰고, CSV 내보내기만 왕복을 줄이려고 크게 요청한다.
  if (limit) q.set('limit', String(limit));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function fetchActivityLogs(
  filter: ActivityLogFilter,
  cursor: ActivityLogCursor | null,
  limit?: number
): Promise<ApiResult<ActivityLogPage>> {
  return run<ActivityLogPage>(() => frontClient().GET(`${BASE}${toQuery(filter, cursor, limit)}`));
}
