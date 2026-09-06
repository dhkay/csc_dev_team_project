// 용량 표기(순수)

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * 바이트를 사람이 읽는 단위로. 1024 기준이고 KB 위로는 소수 한 자리를 남긴다.
 * 0 은 `0 B` 로 쓴다(빈 문자열이나 하이픈으로 만들지 않는다. 값이 없는 것과 0 은 다르다)
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${UNITS[unit]}`;
}

/** 날짜 표기: 로컬 시간대 기준 `2026. 8. 24.` 형태. 값이 없으면 하이픈 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR');
}
