/**
 * 활동 로그 필터의 편집 상태(criteria)와 그 변환. 순수 모듈이라 컴포넌트 없이 테스트한다.
 *
 * criteria 와 조회 필터를 나누는 이유는 화면이 다루는 값과 서버로 보내는 값의 모양이 다르기
 * 때문이다. 날짜는 입력란이 `yyyy-mm-dd` 를 주는데 서버는 ISO 시각을 받고 종료일은 그날 끝까지
 * 포함해야 한다. 그 변환을 컴포넌트에 두면 CSV 내보내기처럼 같은 필터를 쓰는 다른 경로가 조용히
 * 다른 규칙을 갖게 된다.
 *
 * 필터를 새로 추가할 때 손댈 곳은 `ActivityLogCriteria` + `EMPTY_CRITERIA` +
 * `toActivityLogFilter`, 그리고 필터 바의 컨트롤 하나다.
 */
import { MARKETING_ACTION_PREFIX, type ActivityLogFilter } from '../types';

/**
 * 화면이 편집하는 필터 기준. 전부 원시값이라 비교/직렬화가 단순하다.
 * 날짜는 `<input type="date">` 가 주는 `yyyy-mm-dd` 문자열 그대로 들고 있는다.
 */
export interface ActivityLogCriteria {
  channelId: number | null;
  actorId: number | null;
  // 'marketing.' 하위 접두사. 그룹이 서로 배타적이라 단일 선택으로 충분하다.
  actionPrefix: string;
  // yyyy-mm-dd. 빈 문자열이면 미지정
  sinceDate: string;
  untilDate: string;
  failedOnly: boolean;
  // 청구액이 실제로 발생한 활동만(무료/미측정 제외)
  billedOnly: boolean;
}

/**
 * 아무 조건도 걸지 않은 기준. 초기값이자 초기화 버튼의 목적지
 * 밖으로 내보내지 않는다: 공유하면 화면끼리 같은 객체를 편집하게 되므로,
 * 필요한 곳은 아래 `createActivityLogCriteria()` 로 한 벌씩 받아 간다.
 */
const EMPTY_CRITERIA: ActivityLogCriteria = {
  channelId: null,
  actorId: null,
  actionPrefix: MARKETING_ACTION_PREFIX,
  sinceDate: '',
  untilDate: '',
  failedOnly: false,
  billedOnly: false,
};

/** 초기 기준 한 벌. 객체를 새로 만들어 준다(상수를 그대로 쓰면 화면끼리 상태를 공유한다) */
export function createActivityLogCriteria(): ActivityLogCriteria {
  return { ...EMPTY_CRITERIA };
}

/**
 * 필터가 하나라도 걸려 있나. '초기화' 버튼을 켤지 판단하는 데 쓴다.
 * 활동 접두사는 기본값(전체)일 때 걸린 것으로 보지 않는다.
 */
export function isActivityLogFilterActive(criteria: ActivityLogCriteria): boolean {
  return (
    criteria.channelId !== null ||
    criteria.actorId !== null ||
    criteria.actionPrefix !== MARKETING_ACTION_PREFIX ||
    criteria.sinceDate !== '' ||
    criteria.untilDate !== '' ||
    criteria.failedOnly ||
    criteria.billedOnly
  );
}

/**
 * 날짜 입력(yyyy-mm-dd) → ISO 시각
 *
 * `endOfDay` 는 종료일에 쓴다. 그냥 자정으로 보내면 그날 하루가 통째로 빠져서, 사용자는
 * "오늘까지"로 걸었는데 오늘 활동이 안 보이는 상태가 된다.
 * 로컬 시간대 기준으로 하루를 자른다: 사용자가 고른 '그날'은 브라우저가 있는 곳의 하루다.
 */
export function toIsoBoundary(day: string, endOfDay = false): string | null {
  if (!day) return null;
  const parsed = new Date(day);
  if (Number.isNaN(parsed.getTime())) return null;
  // `new Date('2026-08-05')` 는 UTC 자정이라 로컬 하루 경계와 어긋난다. 연/월/일만 받아
  // 로컬 기준으로 다시 만든다(입력값이 표현하는 건 사용자의 달력 날짜다)
  const [year, month, date] = day.split('-').map(Number);
  const local = new Date(year, (month ?? 1) - 1, date ?? 1);
  if (Number.isNaN(local.getTime())) return null;
  if (endOfDay) local.setHours(23, 59, 59, 999);
  return local.toISOString();
}

/** 편집 기준 → 조회 필터(서버/쿼리키가 쓰는 모양) */
export function toActivityLogFilter(criteria: ActivityLogCriteria): ActivityLogFilter {
  return {
    channelId: criteria.channelId,
    actorId: criteria.actorId,
    actionPrefix: criteria.actionPrefix,
    since: toIsoBoundary(criteria.sinceDate),
    until: toIsoBoundary(criteria.untilDate, true),
    failedOnly: criteria.failedOnly,
    billedOnly: criteria.billedOnly,
  };
}
