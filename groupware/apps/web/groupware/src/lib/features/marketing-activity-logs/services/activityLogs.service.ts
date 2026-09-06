// 활동 로그 서비스. 컴포넌트는 이 서비스만 참조한다(조회 옵션 노출, 소비는 createInfiniteQuery)
import * as api from '../apis/activityLogsApi';
import { activityLogsInfiniteQueryOptions } from '../queries/activityLogs.query';
import type { ActivityLogCursor, ActivityLogFilter, ActivityLogRecord } from '../types';

/**
 * 내보내기용 페이지 크기 = BFF 상한(log-server MAX_PAGE_SIZE). 화면 기본값(50)으로 훑으면
 * 왕복이 네 배가 된다. 표는 사람이 읽는 속도에 맞추면 되지만 내보내기는 전량 수집이라 다르다.
 */
const EXPORT_PAGE_SIZE = 200;

/**
 * 내보내기 행 상한. 기간을 열어두고 누르면 원장 전체를 긁어 브라우저 메모리와 log-server 를
 * 동시에 때린다. 상한에 걸리면 조용히 자르지 않고 호출부가 사용자에게 알린다(truncated)
 */
export const EXPORT_MAX_ROWS = 5_000;

export interface ActivityLogExportResult {
  records: ActivityLogRecord[];
  // 상한에 걸려 뒷부분이 빠졌는지. true 면 사용자에게 알려야 한다.
  truncated: boolean;
}

/**
 * 현재 필터에 해당하는 활동을 전부 모은다(화면에 불러온 만큼이 아니라)
 *
 * 표는 '더 보기'로 조금씩 보지만, 내보낸 파일은 보고와 대조에 쓰인다. 스크롤한 만큼만 담기면
 * 받은 사람은 그게 전체인 줄 안다. 그래서 커서를 끝까지(또는 상한까지) 따라간다.
 *
 * 실패는 throw 한다. 부분 파일을 내려주면 사용자가 잘린 줄 모른 채 쓰게 된다.
 */
async function collectForExport(
  filter: ActivityLogFilter,
  onProgress?: (loaded: number) => void,
): Promise<ActivityLogExportResult> {
  const records: ActivityLogRecord[] = [];
  let cursor: ActivityLogCursor | null = null;

  for (;;) {
    const res = await api.fetchActivityLogs(filter, cursor, EXPORT_PAGE_SIZE);
    if (!res.success) {
      throw new Error(res.error ?? '활동 로그를 불러오지 못했습니다.');
    }

    records.push(...res.data.records);
    onProgress?.(records.length);
    cursor = res.data.nextCursor;

    if (!cursor) return { records, truncated: false };
    if (records.length >= EXPORT_MAX_ROWS) {
      return { records: records.slice(0, EXPORT_MAX_ROWS), truncated: true };
    }
  }
}

export const activityLogsService = {
  // 필터별 무한 목록 옵션. 컴포넌트가 createInfiniteQuery(() => ...) 로 소비
  list: (filter: ActivityLogFilter) => activityLogsInfiniteQueryOptions(filter),
  /** CSV 내보내기용 전량 수집. 진행 상황은 onProgress 로 흘린다(버튼 라벨에 쓴다) */
  collectForExport,
};
