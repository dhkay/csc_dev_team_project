/**
 * 활동 로그 → CSV 변환. 순수 함수라 DOM 과 네트워크 없이 단위 테스트할 수 있다.
 *
 * 표를 그대로 옮기지 않고 기계가 읽을 값을 함께 싣는다. 내보낸 파일은 정렬과 집계와 대조에
 * 쓰이므로 일시는 ISO 원문, 활동은 라벨과 코드 두 컬럼, 비용은 숫자 컬럼으로 나눠 담는다.
 * eventId 는 나중에 원장에서 같은 행을 다시 찾기 위해 넣는다.
 *
 * 비용이 없는 행을 0 으로 채우지 않는다(화면과 같은 규칙). 무료와 측정 안 됨은 다른 사실이라
 * 숫자 칸을 비우고 상태 컬럼으로 사유를 남긴다.
 */
import type { ActivityCost, ActivityLogRecord } from '../types';
import { ACTION_LABELS } from '../types';

/** 컬럼 순서 = 헤더 순서. 사람이 먼저 보는 값(일시/사용자/채널)을 앞에 둔다. */
const HEADER = [
  '일시',
  '사용자',
  '이메일',
  '채널',
  '활동',
  '활동코드',
  '버전',
  '수준',
  '내용',
  '비용상태',
  '비용USD',
  '모델',
  '입력토큰',
  '출력토큰',
  '이벤트ID',
  '작업ID',
] as const;

/** 비용 상태 라벨. 화면 문구와 같은 어휘를 쓴다(대조할 때 사람이 헷갈리지 않게) */
const COST_STATUS_LABELS: Record<ActivityCost['status'], string> = {
  computed: '계산됨',
  free: '무료',
  // 크레딧/플랜 벤더: 정액 단가가 없어 우리가 계산하지 않는다. '측정 안 됨'(사용량을 못 받았다)과 다르다.
  metered: '벤더 청구',
  'usage-missing': '측정 안 됨',
  'rate-unknown': '단가 미등록',
};

export interface ActivityLogCsvLookups {
  // actorId → 표시 이름과 이메일. 화면의 조인 규칙을 그대로 넘겨받는다(동명이인 구분)
  actor: (actorId: number | null) => { name: string; email: string | null };
  // payload.channel_id → 채널 이름. 삭제된 채널도 화면과 같은 문구로 남는다.
  channel: (channelId: number | undefined) => string;
}

/**
 * 셀 하나를 CSV 로 안전하게 만든다.
 *
 * 두 가지를 처리한다:
 *   1) RFC4180 이스케이프. 쉼표/따옴표/줄바꿈이 있으면 따옴표로 감싸고 내부 따옴표는 두 번 쓴다.
 *   2) 수식 주입 차단. `=`, `+`, `-`, `@`, 탭, CR 로 시작하는 값은 스프레드시트가 수식으로 해석해
 *      파일을 연 사람의 환경에서 실행될 수 있다. 앞에 작은따옴표를 붙여 문자열로 고정한다.
 *      우리가 만드는 숫자 칸은 숫자로 시작하므로 영향받지 않는다.
 */
function toCell(value: string | number | null | undefined): string {
  if (value == null) return '';
  const raw = String(value);
  if (raw === '') return '';

  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** µUSD 정수 → USD 소수 문자열. 모르는 값은 빈 칸으로 둔다(0 으로 위장하지 않는다) */
function toUsdCell(cost: ActivityCost | undefined): string {
  if (!cost || cost.micro_usd == null) return '';
  return (cost.micro_usd / 1_000_000).toFixed(6);
}

/** 레코드 한 건 → 컬럼 값 배열. HEADER 와 순서가 1:1 이다. */
function toRow(record: ActivityLogRecord, lookups: ActivityLogCsvLookups): string[] {
  const actor = lookups.actor(record.actorId);
  const cost = record.payload.cost;

  return [
    record.occurredAt,
    actor.name,
    actor.email ?? '',
    lookups.channel(record.payload.channel_id),
    ACTION_LABELS[record.action] ?? record.action,
    record.action,
    record.payload.version ?? '',
    record.level,
    record.message,
    cost ? COST_STATUS_LABELS[cost.status] : '',
    toUsdCell(cost),
    cost?.model ?? '',
    record.tokenInput ?? '',
    record.tokenOutput ?? '',
    record.eventId,
    record.jobId ?? '',
  ].map(toCell);
}

/**
 * CSV 본문. 앞에 BOM 을 붙이고 줄바꿈은 CRLF 를 쓴다.
 *
 * BOM 이 없으면 Excel 이 UTF-8 을 못 알아채 한글이 깨진다. 내려받은 파일을 그대로 Excel 에서
 * 여는 것이 이 기능의 주 용도라 인코딩 힌트를 파일에 담는다.
 */
export function buildActivityLogCsv(
  records: ActivityLogRecord[],
  lookups: ActivityLogCsvLookups,
): string {
  const lines = [HEADER.map(toCell), ...records.map((r) => toRow(r, lookups))];
  return `﻿${lines.map((cells) => cells.join(',')).join('\r\n')}\r\n`;
}

/** 저장 파일명(확장자 제외). 같은 날 여러 번 받아도 분 단위로 구분된다. */
export function activityLogCsvBaseName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `마케팅영상_활동로그_${stamp}`;
}
