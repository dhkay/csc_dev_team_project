// 날짜/시간 표시 유틸: 표시 기준 시간대를 명시적으로 고정한다.
// 브라우저 로컬 시간대에 의존하면 해외 접속자에게 한국 기준 'Today'/접속시간이
// 어긋나므로, 항상 시간대(기본 KST)를 받아 그 기준으로 포맷한다.
// 해외 사용자 대상 표시가 필요해지면 timeZone 인자만 바꿔 재사용한다.

/** 한국 표준시(KST, UTC+9): 기본 표시 기준 시간대 */
export const KST_TIME_ZONE = 'Asia/Seoul';

/** 포맷 함수가 받는 시각 입력: Date, ISO 문자열, epoch(ms) 모두 허용 */
export type DateInput = Date | string | number;

/** 입력값을 Date 로 정규화 */
function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

/** 지정 시간대 기준으로 연/월/일/시/분/초를 2자리 문자열로 추출 */
function getDateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';

  // hour12:false 환경에서 자정이 '24' 로 나오는 경우 보정
  const hour = get('hour') === '24' ? '00' : get('hour');

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * 지정 시간대(기본 KST) 기준 'YYYY-MM-DD' 문자열을 반환한다.
 * @param value 포맷할 시각 (기본: 현재 시각)
 * @param timeZone IANA 시간대 (기본: KST)
 */
export function formatDate(value: DateInput = new Date(), timeZone: string = KST_TIME_ZONE): string {
  const { year, month, day } = getDateTimeParts(toDate(value), timeZone);
  return `${year}-${month}-${day}`;
}

/**
 * 지정 시간대(기본 KST) 기준 'YYYY-MM-DD HH:mm:ss' 문자열을 반환한다.
 * @param value 포맷할 시각 (기본: 현재 시각)
 * @param timeZone IANA 시간대 (기본: KST)
 */
export function formatDateTime(value: DateInput = new Date(), timeZone: string = KST_TIME_ZONE): string {
  const { year, month, day, hour, minute, second } = getDateTimeParts(toDate(value), timeZone);
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
