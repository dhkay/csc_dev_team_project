/**
 * 활동 로그 필터 기준 ↔ 조회 필터 변환 잠금
 *
 * 이 모듈이 존재하는 이유가 곧 테스트할 것이다: 표와 CSV 내보내기가 같은 규칙으로 조건을
 * 만들어야 한다. 변환이 컴포넌트에 있으면 둘이 조용히 갈리고, 그때 증상은 "화면에는 있는데
 * 파일에는 없다"라서 원인을 찾기 어렵다.
 */
import { describe, expect, it } from 'vitest';
import {
  createActivityLogCriteria,
  isActivityLogFilterActive,
  toActivityLogFilter,
  toIsoBoundary
} from '$lib/features/marketing-activity-logs/lib/activityLogFilter';
import { MARKETING_ACTION_PREFIX } from '$lib/features/marketing-activity-logs/types';

describe('createActivityLogCriteria', () => {
  it('아무 조건도 걸리지 않은 상태로 시작한다', () => {
    const criteria = createActivityLogCriteria();
    expect(criteria.channelId).toBeNull();
    expect(criteria.actorId).toBeNull();
    expect(criteria.actionPrefix).toBe(MARKETING_ACTION_PREFIX);
    expect(criteria.failedOnly).toBe(false);
    expect(criteria.billedOnly).toBe(false);
  });

  it('호출할 때마다 새 객체를 준다', () => {
    // 상수를 그대로 돌려주면 한 화면의 초기화가 다른 화면의 필터까지 바꾼다.
    const a = createActivityLogCriteria();
    const b = createActivityLogCriteria();
    a.billedOnly = true;
    expect(b.billedOnly).toBe(false);
  });
});

describe('isActivityLogFilterActive', () => {
  it('기본 기준은 걸린 게 없다고 본다', () => {
    expect(isActivityLogFilterActive(createActivityLogCriteria())).toBe(false);
  });

  it('활동 접두사가 기본값이면 걸린 것으로 세지 않는다', () => {
    // 기본값은 '전체'라 조건이 아니다. 이걸 활성으로 세면 초기화 버튼이 늘 켜져 있다.
    const criteria = { ...createActivityLogCriteria(), actionPrefix: MARKETING_ACTION_PREFIX };
    expect(isActivityLogFilterActive(criteria)).toBe(false);
  });

  it.each([
    ['채널', { channelId: 1 }],
    ['사용자', { actorId: 7 }],
    ['활동 접두사', { actionPrefix: 'marketing.final.' }],
    ['시작일', { sinceDate: '2026-08-01' }],
    ['종료일', { untilDate: '2026-08-05' }],
    ['실패만', { failedOnly: true }],
    ['비용 발생만', { billedOnly: true }]
  ])('%s 하나만 걸려도 활성이다', (_label, patch) => {
    expect(isActivityLogFilterActive({ ...createActivityLogCriteria(), ...patch })).toBe(true);
  });
});

describe('toIsoBoundary', () => {
  it('빈 문자열과 잘못된 날짜는 미지정(null)이다', () => {
    expect(toIsoBoundary('')).toBeNull();
    expect(toIsoBoundary('날짜아님')).toBeNull();
  });

  it('시작일은 그날 0시, 종료일은 그날 끝(23:59:59.999)이다', () => {
    // 종료일을 자정으로 보내면 그날 하루가 통째로 빠진다. "오늘까지"로 걸었는데 오늘이
    // 안 보이는 상태가 되고, 사용자는 로그가 유실됐다고 읽는다.
    const start = new Date(toIsoBoundary('2026-08-05')!);
    const end = new Date(toIsoBoundary('2026-08-05', true)!);

    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it('사용자가 고른 달력 날짜를 로컬 기준으로 자른다', () => {
    // `new Date('2026-08-05')` 는 UTC 자정이라 시간대에 따라 전날로 밀린다.
    // 입력란이 표현하는 건 브라우저가 있는 곳의 하루다.
    const start = new Date(toIsoBoundary('2026-08-05')!);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(7); // 0-based: 8월
    expect(start.getDate()).toBe(5);
  });
});

describe('toActivityLogFilter', () => {
  it('기준을 조회 필터 모양으로 옮긴다', () => {
    const filter = toActivityLogFilter({
      channelId: 1,
      actorId: 7,
      actionPrefix: 'marketing.final.',
      sinceDate: '2026-08-01',
      untilDate: '2026-08-05',
      failedOnly: true,
      billedOnly: true
    });

    expect(filter.channelId).toBe(1);
    expect(filter.actorId).toBe(7);
    expect(filter.actionPrefix).toBe('marketing.final.');
    expect(filter.failedOnly).toBe(true);
    expect(filter.billedOnly).toBe(true);
    expect(filter.since).not.toBeNull();
    expect(filter.until).not.toBeNull();
  });

  it('날짜를 비우면 기간 조건을 만들지 않는다', () => {
    const filter = toActivityLogFilter(createActivityLogCriteria());
    expect(filter.since).toBeNull();
    expect(filter.until).toBeNull();
  });
});
