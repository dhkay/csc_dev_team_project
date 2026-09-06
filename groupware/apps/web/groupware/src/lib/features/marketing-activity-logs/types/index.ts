// 마케팅영상 활동 로그 화면 타입: BFF(/api/marketing/activity-logs) 응답 형태
//
// 원장의 성질: at-least-once + 손실 가능(프로듀서 버퍼 오버플로/전송 실패 드롭)이다.
//   활동 원장이지 트랜잭션 저널이 아니다. 정확히 1건이 필요해지면 DB outbox 로 가야 한다.
//   따라서 화면은 "없을 수도 있다"를 정상으로 다루고, 합계를 회계 증빙으로 쓰지 않는다.
import type { BillingMode, CostStatus } from '@csc/pricing';

/** 이 화면이 다루는 활동 접두사(BFF 가 강제하는 값과 동일) */
export const MARKETING_ACTION_PREFIX = 'marketing.';

/**
 * 비용 스냅샷: 이벤트 시점에 동결된 값(payload.cost, snake_case)
 * 단가가 나중에 바뀌어도 과거 행의 금액은 변하지 않는다(그래야 증빙이 된다)
 */
export interface ActivityCost {
  // 단가 커널의 타입을 그대로 쓴다. 유니온을 화면에서 다시 적으면 상태가 늘 때 조용히 어긋난다.
  status: CostStatus;
  // 마이크로USD(1e-6 USD) 정수. 모를 때는 아예 없다: 0 으로 위장하지 않는다.
  micro_usd?: number;
  model: string;
  billing: BillingMode;
  rate_version?: string | null;
  units?: Record<string, number>;
  breakdown?: { unit: string; units: number; micro_usd: number }[];
}

/** 한 줄 = 한 활동. payload 는 서버가 넣은 그대로 통과된다(승격 컬럼이 늘어도 화면은 안 깨진다) */
export interface ActivityLogRecord {
  eventId: string;
  occurredAt: string;
  level: string;
  // 예: 'marketing.source.render_completed'
  action: string;
  message: string;
  actorId: number | null;
  jobId: string | null;
  tokenInput: number | null;
  tokenOutput: number | null;
  payload: Record<string, unknown> & {
    channel_id?: number;
    cost?: ActivityCost;
    // 어느 도구 버전에서 일어난 활동인가. 이 값을 심기 전 기록에는 없다(그래서 선택값이다).
    // 원장은 조직 전체를 한 화면에 모으는데 액션 이름만으로는 두 파이프라인을 가릴 수 없다.
    //
    // `VersionMode` 로 좁히지 않는다. 그 유니온은 지금 쓸 수 있는 버전의 목록이고 이 값은 그때
    // 일어난 일의 기록이다. 좁혀 두면 폐기된 버전의 활동을 타입은 없다고 말하면서 런타임에는
    // 그대로 흘려보낸다. 값으로 분기해야 하는 자리가 생기면 그때 `asVersionMode` 로 좁힌다.
    version?: string;
  };
}

/** 커서 페이징: 둘 중 하나라도 없으면 마지막 페이지다. */
export interface ActivityLogCursor {
  at: string;
  id: string;
}

export interface ActivityLogPage {
  records: ActivityLogRecord[];
  nextCursor: ActivityLogCursor | null;
  // 조건에 맞는 전체 건수(서버 집계). 첫 페이지 응답에만 실리고 이어보기는 null.
  //
  // records 길이와 반드시 구분해서 읽어야 한다. 목록은 커서 페이징이라 화면에 담긴 행 수는
  // '더 보기'를 몇 번 눌렀는지에 달려 있다. 그 수로 필터를 비교하면 같은 데이터를 두고도
  // 없는 차이가 보인다(채널 전체를 다 펼친 뒤 채널 하나를 고르면 1페이지로 되감긴다)
  total: number | null;
}

/**
 * 필터 드롭다운 선택지(id + 표시 이름). 로그 레코드는 id 만 담고 이름은 읽는 시점에 조인하므로,
 * SSR 로더와 화면이 같은 정의를 공유해야 조인 키가 어긋나지 않는다.
 */
export interface ActivityFilterOption {
  id: number;
  name: string;
}

/** 조회 필터: 전부 선택값. 채널/사용자는 id, 기간은 ISO 문자열 */
export interface ActivityLogFilter {
  channelId?: number | null;
  actorId?: number | null;
  since?: string | null;
  until?: string | null;
  // 'marketing.' 하위 접두사만 유효(BFF 가 재검증). 미지정이면 전체
  actionPrefix?: string | null;
  failedOnly?: boolean;
  // 청구액이 실제로 발생한 활동만. 요금이 없는 모델과 미측정은 제외된다.
  // 판정은 log-server 가 payload 의 비용 스냅샷에서 한다(화면이 로드된 행만 걸러내는 게 아니다)
  billedOnly?: boolean;
}

/**
 * 활동 필터 선택지: 접두사 그룹이 서로 배타적이라 단일 선택으로 충분하다.
 * ('marketing.plan.' 은 'marketing.saved_plan.' 의 접두사가 아니다. 그룹이 깨끗하다.)
 */
export const ACTIVITY_GROUPS: { label: string; prefix: string }[] = [
  { label: '전체', prefix: MARKETING_ACTION_PREFIX },
  { label: '기획서 생성', prefix: 'marketing.plan.' },
  { label: '저장 기획안', prefix: 'marketing.saved_plan.' },
  { label: '원천영상', prefix: 'marketing.source.' },
  { label: '최종영상', prefix: 'marketing.final.' }
];

/** 액션 → 한국어 라벨. 목록에 없으면 액션 문자열을 그대로 보여준다(신규 액션이 화면을 비우지 않게) */
export const ACTION_LABELS: Record<string, string> = {
  'marketing.plan.generated': '기획서 생성',
  // 기획 앞의 입력 정제(유료 LLM 호출). 상세에 원문과 정제본이 나란히 남는다.
  'marketing.plan.brief_refined': '입력 정제',
  'marketing.plan.scene_image_generated': '씬 이미지 생성',
  'marketing.saved_plan.created': '기획안 저장',
  'marketing.saved_plan.scene_updated': '기획안 씬 수정',
  'marketing.saved_plan.deleted': '기획안 삭제',
  'marketing.source.created': '원천영상 생성',
  'marketing.source.rerendered': '원천영상 재렌더',
  'marketing.source.deleted': '원천영상 삭제',
  'marketing.source.render_completed': '원천영상 렌더 완료',
  // 취소 = 생성 불가로 작업을 되돌림(산출물 없음)
  //
  // render_failed 두 줄은 지난 기록 전용이다. 서버는 그 값을 더 이상 쓰지 않고(쓰는 쪽 어휘인
  //   ActivityAction 에서 빠졌다) 원장에는 남아 있다. 라벨을 지우면 그 행이 액션 코드 원문으로
  //   떨어져 읽을 수 없게 되므로 여기서는 지우지 않는다. 원장을 읽는 쪽이 옛 어휘를 아는 자리다.
  'marketing.source.render_cancelled': '원천영상 취소(생성 불가)',
  'marketing.source.render_failed': '원천영상 렌더 실패',
  // 원천 영상의 보관함 이동. 최종과 짝이 따로인 이유: 원천과 최종을 가르지 않는 버전에서는 보관물이
  //   원천 표에서 오고, 한 라벨로 합치면 어느 표의 항목인지 읽는 쪽이 알 수 없다.
  'marketing.source.archived': '영상 보관함 보내기',
  'marketing.source.unarchived': '영상 보관함에서 꺼내기',
  'marketing.final.created': '최종영상 생성',
  'marketing.final.rerendered': '최종영상 재렌더',
  'marketing.final.deleted': '최종영상 삭제',
  'marketing.final.render_completed': '최종영상 렌더 완료',
  'marketing.final.render_cancelled': '최종영상 취소(생성 불가)',
  'marketing.final.render_failed': '최종영상 렌더 실패',
  // 보관함(조직 공유) 이동: 삭제가 아니라 위치 전이. 행위자는 소유자가 아닐 수 있다(꺼내기=채널 관리자)
  'marketing.final.archived': '최종영상 보관함 보내기',
  'marketing.final.unarchived': '최종영상 보관함에서 꺼내기'
};
