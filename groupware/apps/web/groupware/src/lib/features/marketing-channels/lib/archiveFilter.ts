/**
 * 보관함 목록 검색/필터/정렬: 순수 함수(프레임워크 비종속, 그래서 단위 테스트가 본체다)
 *
 * 클라이언트에서 거르는 이유: 보관함 조회는 채널 단위로 전량이 한 번에 내려오고(백엔드에 limit/offset이
 * 없다) 페이지가 그 배열을 이미 들고 있다. 서버 왕복 없이 `$derived` 한 번이면 끝나고, 이 도구의 다른
 * 검색(용어 사전, 단어 관리)도 같은 방식이라 일관된다.
 * 목록이 수천 건대로 커지면 그때 서버 검색(활동 로그의 커서 방식)으로 옮긴다.
 */
import { formatDate } from '$lib/shared/lib/utils/dateTimeUtils';
import type { ArchivedVideo } from '../types';

/** 정렬 종류 id: ARCHIVE_SORTS 에서 파생(카탈로그가 SSOT) */
export type ArchiveSortId = (typeof ARCHIVE_SORTS)[number]['id'];

/**
 * 정렬 카탈로그 = 데이터. UI 는 이 배열을 그대로 렌더하므로 정렬 추가는 여기 한 줄이면 끝이다.
 *
 * createdAt 은 ISO 문자열이라 사전순 비교가 곧 시간순 비교다(Date 파싱 불필요)
 * 제목은 한글 정렬이 필요해 localeCompare('ko')
 */
export const ARCHIVE_SORTS = [
  {
    id: 'recent',
    label: '최신순',
    compare: (a: ArchivedVideo, b: ArchivedVideo) => b.createdAt.localeCompare(a.createdAt),
  },
  {
    id: 'oldest',
    label: '오래된순',
    compare: (a: ArchivedVideo, b: ArchivedVideo) => a.createdAt.localeCompare(b.createdAt),
  },
  {
    id: 'title',
    label: '제목순',
    compare: (a: ArchivedVideo, b: ArchivedVideo) => a.title.localeCompare(b.title, 'ko'),
  },
] as const;

/**
 * 보관함 화면의 검색/필터 상태
 *
 * 작업자 기준(특정 작업자만 / 내 것만)이 없다. 보관함은 그 사람의 것이라 목록에 남이 없다.
 * (채널이 개인 소유가 되면서 조직 공유 열람이 사라졌다)
 */
export interface ArchiveFilterCriteria {
  // 제목에 부분일치. 공백만 있으면 무시
  search: string;
  // 'yyyy-mm-dd'. '' = 무제한. 양끝 포함
  since: string;
  until: string;
  sort: ArchiveSortId;
}

export const DEFAULT_ARCHIVE_FILTER: ArchiveFilterCriteria = {
  search: '',
  since: '',
  until: '',
  sort: 'recent',
};

/**
 * 필터만 지우고 정렬은 남긴다: 정렬은 목록을 좁히는 게 아니라 보는 순서라, 초기화로 되돌리면
 * 사용자가 방금 고른 순서가 사라져 놀란다. 초기화 버튼이 여러 곳(툴바, 결과 없음 안내)에 있어
 * 규칙을 한 곳에 둔다.
 */
export function resetArchiveFilter(current: ArchiveFilterCriteria): ArchiveFilterCriteria {
  return { ...DEFAULT_ARCHIVE_FILTER, sort: current.sort };
}

/**
 * 필터가 하나라도 걸려 있는가: "결과 없음" 문구를 "보관함이 빔"과 가르고, 초기화 버튼 노출을 정한다.
 * 정렬은 세지 않는다: 순서만 바꿀 뿐 목록을 좁히지 않으므로 초기화 대상이 아니다.
 */
export function isArchiveFilterActive(c: ArchiveFilterCriteria): boolean {
  return c.search.trim() !== '' || c.since !== '' || c.until !== '';
}

/**
 * 날짜 범위 판정용 키: KST 기준 'yyyy-mm-dd'
 *
 * ISO 문자열을 그냥 앞 10자로 자르면 UTC 날짜가 나와, 한국 새벽에 만든 항목(예: 08-01 08:00 KST =
 * 07-31 23:00Z)이 전날로 묶인다. 사용자가 고르는 날짜 입력은 자기 달력(KST) 기준이므로 여기서도 맞춘다.
 * (이 앱의 표시 기준 시간대 규약 = dateTimeUtils)
 * 키가 'yyyy-mm-dd' 라 이후 비교는 문자열 사전순만으로 정확하다.
 */
function dateKey(isoTimestamp: string): string {
  return formatDate(isoTimestamp);
}

/**
 * 기준에 맞는 항목만 남기고 정렬해서 돌려준다(입력 배열은 건드리지 않는다)
 * 조건은 전부 AND: 좁힐수록 결과가 줄어드는 게 예측 가능하다.
 */
export function filterArchivedVideos(
  items: readonly ArchivedVideo[],
  criteria: ArchiveFilterCriteria,
): ArchivedVideo[] {
  const query = criteria.search.trim().toLowerCase();
  const sort = ARCHIVE_SORTS.find((s) => s.id === criteria.sort) ?? ARCHIVE_SORTS[0];

  const matched = items.filter((item) => {
    if (criteria.since || criteria.until) {
      const day = dateKey(item.createdAt);
      if (criteria.since && day < criteria.since) return false;
      if (criteria.until && day > criteria.until) return false; // until 당일 포함
    }

    // 제목만 대상: 목록이 전부 자기 것이라 작업자 이름으로 찾을 일이 없다.
    if (query && !item.title.toLowerCase().includes(query)) return false;
    return true;
  });

  return matched.sort(sort.compare);
}
