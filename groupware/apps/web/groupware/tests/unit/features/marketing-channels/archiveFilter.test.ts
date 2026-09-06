// 보관함 검색/필터/정렬: 순수 함수라 여기가 이 기능의 본체 검증이다.
// 화면에서 조용히 틀리는 종류(경계 날짜가 빠짐, 조건이 OR 로 새는 것)를 못박는다.
// 작업자 기준이 없다: 보관함은 조직 공용이라 목록에 남의 것이 섞이지만, 그것을 거르는 조건은
// 두지 않았다(찾는 기준은 제목과 날짜다). 만든 사람은 카드 배지로 보여 주는 값이라 이 함수 밖이다.
import { describe, it, expect } from 'vitest';
import {
  ARCHIVE_SORTS,
  DEFAULT_ARCHIVE_FILTER,
  filterArchivedVideos,
  isArchiveFilterActive,
  type ArchiveFilterCriteria
} from '../../../../src/lib/features/marketing-channels/lib/archiveFilter';
import type { ArchivedVideo } from '../../../../src/lib/features/marketing-channels/types';

const ME = 7;

function make(o: Partial<ArchivedVideo> & { id: number }): ArchivedVideo {
  return {
    title: '기본 제목',
    ownerUserId: ME,
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    renderStatus: 'COMPLETED',
    progress: null,
    resultUrl: 'https://x/1',
    thumbnailUrl: null,
    error: null,
    aspectRatio: '1:1',
    ...o
  };
}

/** 제목과 날짜가 서로 다른 4건(소유자는 모두 같다: 이 함수가 소유를 보지 않는다) */
const ITEMS: ArchivedVideo[] = [
  make({ id: 1, title: '여름 발진 루틴', createdAt: '2026-07-01T09:00:00.000Z' }),
  make({ id: 2, title: '겨울 보습 가이드', createdAt: '2026-07-15T09:00:00.000Z' }),
  make({ id: 3, title: 'SUMMER 세일', createdAt: '2026-07-31T09:00:00.000Z' }),
  make({ id: 4, title: '봄 신상', createdAt: '2026-06-20T09:00:00.000Z' })
];

const filter = (patch: Partial<ArchiveFilterCriteria> = {}) =>
  filterArchivedVideos(ITEMS, { ...DEFAULT_ARCHIVE_FILTER, ...patch });
const ids = (rows: ArchivedVideo[]) => rows.map((r) => r.id);

describe('검색', () => {
  it('빈 검색어는 전체를 통과시킨다', () => {
    expect(filter().length).toBe(4);
    expect(filter({ search: '   ' }).length).toBe(4);
  });

  it('제목에 부분일치한다', () => {
    expect(ids(filter({ search: '발진' }))).toEqual([1]);
  });

  it('대소문자와 앞뒤 공백을 무시한다', () => {
    expect(ids(filter({ search: '  summer ' }))).toEqual([3]);
  });

  it('없는 말은 0건', () => {
    expect(filter({ search: '존재하지않는말' })).toEqual([]);
  });
});

describe('기간', () => {
  it('since 만. 그날 포함', () => {
    expect(ids(filter({ since: '2026-07-15' })).sort()).toEqual([2, 3]);
  });

  it('until 만. 그날 포함', () => {
    expect(ids(filter({ until: '2026-07-01' })).sort()).toEqual([1, 4]);
  });

  it('양쪽을 걸면 두 경계일 모두 포함한다', () => {
    expect(ids(filter({ since: '2026-07-01', until: '2026-07-15' })).sort()).toEqual([1, 2]);
  });

  it('빈 문자열은 무제한(그쪽 경계 없음)', () => {
    expect(filter({ since: '', until: '' }).length).toBe(4);
  });

  // 날짜 버킷은 KST 기준이다. ISO 앞 10자(UTC)로 자르면 한국 새벽 항목이 전날로 묶여,
  // 사용자가 자기 달력 날짜로 골랐을 때 안 나온다.
  it('한국 새벽 항목은 KST 날짜로 묶인다 (07-31 23:00Z = 08-01 08:00 KST)', () => {
    const dawn = [make({ id: 99, createdAt: '2026-07-31T23:00:00.000Z' })];
    const inAug = filterArchivedVideos(dawn, { ...DEFAULT_ARCHIVE_FILTER, since: '2026-08-01' });
    expect(ids(inAug)).toEqual([99]);

    // 같은 항목이 UTC 기준 날짜(07-31)로는 잡히지 않아야 한다.
    const inJul = filterArchivedVideos(dawn, { ...DEFAULT_ARCHIVE_FILTER, until: '2026-07-31' });
    expect(inJul).toEqual([]);
  });

  it('KST 하루의 양 끝(00:00, 23:59)이 같은 날짜로 묶인다', () => {
    const edges = [
      make({ id: 1, createdAt: '2026-07-14T15:00:00.000Z' }), // 07-15 00:00 KST
      make({ id: 2, createdAt: '2026-07-15T14:59:00.000Z' }) // 07-15 23:59 KST
    ];
    const hit = filterArchivedVideos(edges, {
      ...DEFAULT_ARCHIVE_FILTER,
      since: '2026-07-15',
      until: '2026-07-15',
      sort: 'oldest'
    });
    expect(ids(hit)).toEqual([1, 2]);
  });
});

describe('정렬', () => {
  it('최신순이 기본', () => {
    expect(ids(filter())).toEqual([3, 2, 1, 4]);
  });

  it('오래된순', () => {
    expect(ids(filter({ sort: 'oldest' }))).toEqual([4, 1, 2, 3]);
  });

  it('제목순: 한글 가나다 정렬, 라틴 제목은 그 뒤', () => {
    // localeCompare('ko') 는 한글을 라틴보다 앞에 둔다: 겨울 → 봄 → 여름 → SUMMER.
    expect(ids(filter({ sort: 'title' }))).toEqual([2, 4, 1, 3]);
  });

  it('입력 배열을 변형하지 않는다', () => {
    const before = ids(ITEMS);
    filter({ sort: 'oldest' });
    expect(ids(ITEMS)).toEqual(before);
  });

  it('기본 정렬 id 가 카탈로그에 실재한다. 오타 시 조용히 첫 항목으로 폴백되지 않게', () => {
    expect(ARCHIVE_SORTS.some((s) => s.id === DEFAULT_ARCHIVE_FILTER.sort)).toBe(true);
  });
});

describe('isArchiveFilterActive', () => {
  it('기본값은 비활성', () => {
    expect(isArchiveFilterActive(DEFAULT_ARCHIVE_FILTER)).toBe(false);
  });

  it('정렬만 바꾼 건 필터가 아니다. 목록을 좁히지 않으므로 초기화 대상이 아니다', () => {
    expect(isArchiveFilterActive({ ...DEFAULT_ARCHIVE_FILTER, sort: 'title' })).toBe(false);
  });

  it('공백뿐인 검색어는 비활성', () => {
    expect(isArchiveFilterActive({ ...DEFAULT_ARCHIVE_FILTER, search: '  ' })).toBe(false);
  });

  it.each([
    ['검색어', { search: '가' }],
    ['시작일', { since: '2026-07-01' }],
    ['종료일', { until: '2026-07-01' }]
  ])('%s 가 걸리면 활성', (_label, patch) => {
    expect(isArchiveFilterActive({ ...DEFAULT_ARCHIVE_FILTER, ...patch })).toBe(true);
  });
});
