// 마케팅영상 활동 로그 조회 BFF. log-server `POST /logs/search` 로 중계(서비스토큰 자동 주입)
//
// 스코프는 BFF 가 확정한다(브라우저가 고르지 않는다):
//   - organizationId = 세션 조직. all_orgs 는 리터럴 false 이고 어디서도 파생시키지 않는다.
//     (플랫폼 ROOT 전 조직 조회는 control-tower 의 몫이고, 여기는 조직 도구 화면이다.)
//   - kind=AUDIT + aiTool=marketing-video + actionPrefix=marketing. 로 마케팅영상 원장만 본다.
//   - 버전으로 좁히지 않는다. v1.0 과 v1.5 는 한 원장을 쓰고 이 화면은 실제로 일어난 일을 말한다.
// 열람 권한은 requireLogViewer(관리급 = 루트/대표/팀장). 사이드바 가시성(canViewLogs)과 같은 판정의 집행 지점.
// 통과한 사람에게는 조직 전체가 보인다. channelId 는 필터이고 경계가 아니다(자기 채널로 좁히지 않는다)
import type { RequestEvent } from '@sveltejs/kit';
import { AiToolKey } from '@csc/entitlements';
import { serverLogClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok } from '$lib/server/http/bff';
import {
  mapMarketingError,
  parseChannelId,
  parsePositiveId,
  requireLogViewer
} from '$lib/server/marketing/bff';

/** 한 페이지 크기. log-server MAX_PAGE_SIZE 이하이고, 감사 표는 스크롤보다 '더 보기'가 자연스럽다. */
const PAGE_SIZE = 50;

/**
 * 페이지 크기 상한 = log-server MAX_PAGE_SIZE. CSV 내보내기는 전체 결과를 페이지로 훑으므로
 * 화면 기본값(50)이면 왕복이 네 배로 늘어난다. 상한은 여기서 다시 조인다(백엔드도 캡을 걸지만,
 * 브라우저가 보낸 값을 그대로 흘려보내지 않는 편이 경계가 분명하다)
 */
const MAX_PAGE_SIZE = 200;

/** limit 파라미터. 숫자가 아니거나 0 이하면 화면 기본값으로 되돌린다. */
function parseLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return PAGE_SIZE;
  return Math.min(Math.trunc(n), MAX_PAGE_SIZE);
}

/** 이 화면이 다루는 활동만 남긴다. 다른 도구가 로그를 보내기 시작해도 섞이지 않는다. */
const ACTION_PREFIX = 'marketing.';

/** log-server 응답 레코드(필요한 필드만. payload 는 그대로 통과시켜 비용/상세를 화면이 읽는다) */
interface RawLogRecord {
  event_id: string;
  occurred_at: string;
  level: string;
  action: string;
  message: string;
  actor_id: number | null;
  job_id: string | null;
  token_input: number | null;
  token_output: number | null;
  payload: Record<string, unknown>;
}

interface RawSearchResponse {
  records?: RawLogRecord[];
  next_cursor_at?: string | null;
  next_cursor_id?: string | null;
  // 조건에 맞는 전체 건수. 첫 페이지 응답에만 실린다(이어보기는 null)
  total?: number | null;
}

/**
 * 불리언 플래그 파라미터. 정확히 'true' 일 때만 켠다.
 *
 * 존재 여부('?failedOnly' 만 있어도 참)로 읽지 않는 이유: 화면이 끌 때 파라미터를 아예 빼는
 * 방식과 'false' 로 보내는 방식이 섞여도 같은 뜻이 되어야 한다. 필터를 끄는 요청이 조용히
 * 켜지면 사용자는 목록이 왜 좁아졌는지 알 방법이 없다.
 */
function parseFlag(raw: string | null): boolean {
  return raw === 'true';
}

/** ISO 날짜/시각 파라미터. 파싱 불가면 null(필터 미적용). 값 자체는 log-server 가 재검증한다. */
function parseIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * 활동 로그 조회: GET /api/marketing/activity-logs
 *
 * 쿼리: channelId, actorId, since, until, actionPrefix, failedOnly, cursorAt, cursorId
 * (전부 스칼라라 배열 인코딩 문제가 없어 GET 으로 둔다. 백엔드는 POST 본문이다)
 */
export async function GET(event: RequestEvent) {
  const auth = await requireLogViewer(event);
  if ('error' in auth) return auth.error;

  const q = event.url.searchParams;
  const channelId = parseChannelId(q.get('channelId'));
  const actorId = parsePositiveId(q.get('actorId'));
  const since = parseIsoDate(q.get('since'));
  const until = parseIsoDate(q.get('until'));
  const cursorAt = parseIsoDate(q.get('cursorAt'));
  const cursorId = q.get('cursorId');
  const failedOnly = parseFlag(q.get('failedOnly'));
  const billedOnly = parseFlag(q.get('billedOnly'));
  const limit = parseLimit(q.get('limit'));

  // 활동 필터. 화면이 보낸 접두사는 반드시 'marketing.' 하위여야 한다(다른 도구/전체 원장 열람 차단)
  const requested = q.get('actionPrefix');
  const actionPrefix =
    requested && requested.startsWith(ACTION_PREFIX) ? requested : ACTION_PREFIX;

  try {
    const res = await serverLogClient().POST<RawSearchResponse>('/logs/search', {
      organization_id: auth.orgId,
      all_orgs: false, // 리터럴. 세션/쿼리에서 파생시키지 않는다
      kind: 'AUDIT',
      ai_tool: AiToolKey.MarketingVideo,
      action_prefix: actionPrefix,
      // 실패만 보기. 렌더 실패는 WARN 으로 남는다(ERROR 는 스택을 든 kind=ERROR 전용)
      ...(failedOnly ? { levels: ['WARN', 'ERROR'] } : {}),
      // 비용 발생만. 무료(0)와 미측정은 제외된다: 판정은 log-server 가 payload 에서 한다.
      ...(billedOnly ? { billed_only: true } : {}),
      ...(channelId ? { channel_id: channelId } : {}),
      ...(actorId ? { actor_id: actorId } : {}),
      ...(since ? { since } : {}),
      ...(until ? { until } : {}),
      ...(cursorAt && cursorId ? { cursor_at: cursorAt, cursor_id: cursorId } : {}),
      limit
    });

    const raw = res.data ?? {};
    const records = (raw.records ?? []).map((r) => ({
      eventId: r.event_id,
      occurredAt: r.occurred_at,
      level: r.level,
      action: r.action,
      message: r.message,
      actorId: r.actor_id,
      jobId: r.job_id,
      tokenInput: r.token_input,
      tokenOutput: r.token_output,
      payload: r.payload ?? {}
    }));

    // 다음 페이지 커서. 둘 중 하나라도 없으면 마지막 페이지다(부분 커서로 재조회하지 않는다)
    const nextCursor =
      raw.next_cursor_at && raw.next_cursor_id
        ? { at: raw.next_cursor_at, id: raw.next_cursor_id }
        : null;

    // total 은 첫 페이지에만 실린다. 화면은 이 값으로 '조건에 맞는 건수'를 보여주고,
    // records.length 는 '지금까지 불러온 만큼'으로만 읽는다(둘을 섞으면 페이징 상태가
    // 필터 결과처럼 보인다)
    return ok({ records, nextCursor, total: raw.total ?? null });
  } catch (error) {
    return mapMarketingError(error, '활동 로그를 불러오지 못했습니다.');
  }
}
