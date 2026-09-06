/**
 * 활동 로그 CSV 변환 테스트. 내보낸 파일은 사람이 열어보고 다른 자료와 대조하는 산출물이라,
 * 깨지는 방식이 조용하다(열이 밀리거나 한글이 깨진 채로 배포됨). 아래 성질을 고정한다.
 *
 *   - 이스케이프: 쉼표/따옴표/줄바꿈이 든 메시지가 열을 밀지 않는다.
 *   - 수식 주입 차단: '='로 시작하는 값이 스프레드시트에서 수식으로 실행되지 않는다.
 *   - 비용 공백: 금액을 모르는 행을 0 으로 채우지 않는다(무료와 측정 안 됨은 다른 사실)
 *   - BOM: Excel 이 UTF-8 로 열어 한글이 깨지지 않는다.
 */
import { describe, expect, it } from 'vitest';
import {
  activityLogCsvBaseName,
  buildActivityLogCsv,
} from '$lib/features/marketing-activity-logs/lib/activityLogsCsv';
import type { ActivityLogRecord } from '$lib/features/marketing-activity-logs/types';

const lookups = {
  actor: (id: number | null) =>
    id == null ? { name: '시스템', email: null } : { name: '홍길동', email: 'hong@csc.test' },
  channel: (id: number | undefined) => (id == null ? '-' : '뷰티 채널'),
};

function makeRecord(overrides: Partial<ActivityLogRecord> = {}): ActivityLogRecord {
  return {
    eventId: 'evt-1',
    occurredAt: '2026-08-05T01:23:45.000Z',
    level: 'INFO',
    action: 'marketing.plan.generated',
    message: '기획서 5건 생성',
    actorId: 7,
    jobId: null,
    tokenInput: 1200,
    tokenOutput: 800,
    payload: { channel_id: 3 },
    ...overrides,
  };
}

/** BOM 을 떼고 CRLF 로 자른 줄 배열. 본문 검증에 쓴다. */
function lines(csv: string): string[] {
  return csv.replace(/^﻿/, '').trimEnd().split('\r\n');
}

describe('buildActivityLogCsv', () => {
  it('BOM 으로 시작한다. 없으면 Excel 이 UTF-8 을 못 알아채 한글이 깨진다', () => {
    expect(buildActivityLogCsv([], lookups).startsWith('﻿')).toBe(true);
  });

  it('레코드가 없어도 헤더는 남는다. 빈 파일은 실패와 구분되지 않는다', () => {
    const rows = lines(buildActivityLogCsv([], lookups));
    expect(rows).toHaveLength(1);
    expect(rows[0].startsWith('일시,사용자,이메일,채널,활동')).toBe(true);
  });

  it('표에 없는 기계용 값(활동코드, 이벤트ID)을 함께 싣는다', () => {
    const [, row] = lines(buildActivityLogCsv([makeRecord()], lookups));
    expect(row).toContain('기획서 생성'); // 사람이 읽는 라벨
    expect(row).toContain('marketing.plan.generated'); // 기계가 읽는 코드
    expect(row).toContain('evt-1');
    expect(row).toContain('2026-08-05T01:23:45.000Z'); // 표시 형식이 아니라 ISO 원문
  });

  it('도구 버전을 컬럼으로 싣고, 없는 기록은 칸을 비운다', () => {
    // 원장은 조직 전체를 모으므로 v1.0 과 v1.5 활동이 같은 파일에 섞인다. 액션 코드는 둘이 같아
    //   이 컬럼이 없으면 내보낸 파일에서 두 파이프라인의 지출을 나눠 집계할 수 없다.
    const [, v15] = lines(
      buildActivityLogCsv([makeRecord({ payload: { channel_id: 3, version: 'v1.5' } })], lookups),
    );
    expect(v15.split(',')).toContain('v1.5');

    // 버전을 심기 전 기록에는 그 값이 없다. 빈 칸으로 두고 지어내지 않는다(비용 칸과 같은 규칙)
    const [, legacy] = lines(buildActivityLogCsv([makeRecord()], lookups));
    expect(legacy.split(',')).not.toContain('v1.0');
    expect(legacy.split(',').length).toBe(v15.split(',').length);
  });

  it('쉼표/따옴표/줄바꿈이 든 값은 따옴표로 감싸고 내부 따옴표를 두 번 쓴다', () => {
    const csv = buildActivityLogCsv(
      [makeRecord({ message: '취소됨, 사유: "이미지 생성 불가"\n재시도 필요' })],
      lookups,
    );
    expect(csv).toContain('"취소됨, 사유: ""이미지 생성 불가""\n재시도 필요"');
    // 값 안의 줄바꿈이 행을 쪼개지 않는다(따옴표 안이라 CRLF 분리로는 4줄이 되지만 헤더+본문 구조는 유지)
    expect(csv.replace(/^﻿/, '').split('\r\n')[0]).toContain('일시,사용자');
  });

  it("'=' 로 시작하는 값은 수식으로 실행되지 않도록 앞에 작은따옴표를 붙인다", () => {
    const csv = buildActivityLogCsv([makeRecord({ message: '=1+1' })], lookups);
    expect(csv).toContain("'=1+1");
  });

  it('비용이 있으면 USD 숫자로 적는다(표시 문자열 $0.0318 이 아니라 계산 가능한 값)', () => {
    const csv = buildActivityLogCsv(
      [
        makeRecord({
          payload: {
            channel_id: 3,
            cost: { status: 'computed', micro_usd: 31_800, model: 'flux', billing: 'org-key' },
          },
        }),
      ],
      lookups,
    );
    expect(csv).toContain('계산됨,0.031800,flux');
  });

  it('금액을 모르는 행은 빈 칸으로 둔다(0 으로 위장하면 합계가 사실과 달라진다)', () => {
    const csv = buildActivityLogCsv(
      [
        makeRecord({
          payload: {
            channel_id: 3,
            cost: { status: 'usage-missing', model: 'grok', billing: 'org-key' },
          },
        }),
      ],
      lookups,
    );
    expect(csv).toContain('측정 안 됨,,grok');
    expect(csv).not.toContain('측정 안 됨,0');
  });

  it('알 수 없는 액션은 코드를 그대로 라벨 자리에 쓴다. 신규 액션이 칸을 비우지 않게', () => {
    const [, row] = lines(
      buildActivityLogCsv([makeRecord({ action: 'marketing.brand_new.thing' })], lookups),
    );
    expect(row).toContain('marketing.brand_new.thing,marketing.brand_new.thing');
  });

  it('행위자가 없는 기록은 시스템으로 적는다', () => {
    const [, row] = lines(buildActivityLogCsv([makeRecord({ actorId: null })], lookups));
    expect(row).toContain('시스템');
  });
});

describe('activityLogCsvBaseName', () => {
  it('분 단위 시각을 담아 같은 날 여러 번 받아도 파일이 구분된다', () => {
    const name = activityLogCsvBaseName(new Date(2026, 7, 5, 9, 4));
    expect(name).toBe('마케팅영상_활동로그_20260805_0904');
  });
});
