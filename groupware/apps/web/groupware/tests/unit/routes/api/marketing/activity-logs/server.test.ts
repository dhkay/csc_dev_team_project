// 활동 로그 BFF 라우트. 인가 게이트와 스코프 확정을 고정한다.
//
// 이 라우트에서 틀리면 조용히 새는 두 가지를 테스트로 못박는다:
//   1) 열람 권한(관리급 = 루트/대표/팀장)이 아닌 세션이 조직 전체 원장을 읽는 것
//   2) 브라우저가 스코프(all_orgs / organization_id / action_prefix)를 넘겨 다른 조직과 다른 도구의
//      로그를 끌어오는 것. 세 값은 전부 BFF 가 확정해야 한다.
// 판정 규칙 자체는 toolAccess.test.ts 가 고정한다. 여기서는 그 규칙이 이 라우트에 실제로 걸려 있는지만 본다.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrgPosition } from '@csc/entitlements';

const post = vi.fn();

vi.mock('$lib/infrastructure/http/serverClientInstances', () => ({
  serverLogClient: () => ({ POST: post })
}));

// 모의(vi.mock)가 적용된 뒤 라우트를 로드한다. 라우트가 모듈 스코프에서 클라이언트를 잡기 때문
const { GET } = await import('../../../../../../src/routes/api/marketing/activity-logs/+server');

type FakeUser = {
  organization?: { id: number } | null;
  role?: string;
  position?: OrgPosition | null;
};

/** 최소 RequestEvent. 라우트가 실제로 읽는 것만 채운다(locals.accessToken/getUser, url) */
function makeEvent(user: FakeUser | null, query = '') {
  return {
    url: new URL(`http://localhost/api/marketing/activity-logs${query}`),
    locals: {
      accessToken: user ? 'token' : undefined,
      userId: 7,
      getUser: async () => user
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const ROOT: FakeUser = { organization: { id: 12 }, role: 'ROOT', position: null };
const REPRESENTATIVE: FakeUser = {
  organization: { id: 12 },
  role: 'ADMIN',
  position: OrgPosition.Representative
};
const TEAM_LEADER: FakeUser = {
  organization: { id: 12 },
  role: 'ADMIN',
  position: OrgPosition.TeamLeader
};
// 직책 없는 일반 조직원. 채널을 갖고 영상을 만들 수는 있지만 조직 전체 원장은 볼 수 없다
const MEMBER: FakeUser = { organization: { id: 12 }, role: 'ADMIN', position: null };

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: { records: [], next_cursor_at: null, next_cursor_id: null } });
});

describe('활동 로그 BFF (GET)', () => {
  it('루트 권한자는 조회할 수 있다', async () => {
    const res = await GET(makeEvent(ROOT));
    expect(res.status).toBe(200);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('대표도 조회할 수 있다(사이드바 가시성 canViewLogs 과 같은 조건)', async () => {
    const res = await GET(makeEvent(REPRESENTATIVE));
    expect(res.status).toBe(200);
  });

  it('팀장도 조회할 수 있다(관리급). 범위는 조직 전체라 자기 채널로 좁히지 않는다', async () => {
    const res = await GET(makeEvent(TEAM_LEADER));
    expect(res.status).toBe(200);
    const body = post.mock.calls[0][1];
    expect(body.organization_id).toBe(12);
    expect(body).not.toHaveProperty('channel_id');
    expect(body).not.toHaveProperty('actor_id');
  });

  it('직책 없는 조직원은 403. 원장은 조직 전체를 담으므로 전원에게 열지 않는다', async () => {
    const res = await GET(makeEvent(MEMBER));
    expect(res.status).toBe(403);
    expect(post).not.toHaveBeenCalled();
  });

  it('비로그인은 401', async () => {
    const res = await GET(makeEvent(null));
    expect(res.status).toBe(401);
    expect(post).not.toHaveBeenCalled();
  });

  it('스코프는 BFF 가 확정한다. all_orgs 는 리터럴 false, 조직은 세션 값', async () => {
    // 쿼리로 다른 조직/전체 조회를 시도해도 본문에 반영되지 않아야 한다
    await GET(makeEvent(ROOT, '?organizationId=99&all_orgs=true&allOrgs=true&kind=EVENT'));
    const body = post.mock.calls[0][1];
    expect(body.organization_id).toBe(12);
    expect(body.all_orgs).toBe(false);
    expect(body.kind).toBe('AUDIT');
    expect(body.ai_tool).toBe('marketing-video');
  });

  it("활동 접두사는 'marketing.' 하위로 강제된다", async () => {
    // 다른 도구/전체 원장을 노린 접두사는 무시하고 기본값으로 되돌린다
    await GET(makeEvent(ROOT, '?actionPrefix=admin.'));
    expect(post.mock.calls[0][1].action_prefix).toBe('marketing.');

    post.mockClear();
    await GET(makeEvent(ROOT, '?actionPrefix='));
    expect(post.mock.calls[0][1].action_prefix).toBe('marketing.');

    post.mockClear();
    await GET(makeEvent(ROOT, '?actionPrefix=marketing.source.'));
    expect(post.mock.calls[0][1].action_prefix).toBe('marketing.source.');
  });

  it('빈 필터는 본문에 넣지 않는다. 백엔드가 미지정으로 다룬다', async () => {
    await GET(makeEvent(ROOT));
    const body = post.mock.calls[0][1];
    expect(body).not.toHaveProperty('channel_id');
    expect(body).not.toHaveProperty('actor_id');
    expect(body).not.toHaveProperty('since');
    expect(body).not.toHaveProperty('levels');
  });

  it('필터를 스칼라로 정규화해 전달한다', async () => {
    await GET(
      makeEvent(ROOT, '?channelId=5&actorId=42&since=2026-07-01&until=2026-07-31&failedOnly=true')
    );
    const body = post.mock.calls[0][1];
    expect(body.channel_id).toBe(5);
    expect(body.actor_id).toBe(42);
    expect(body.since).toContain('2026-07-01');
    expect(body.levels).toEqual(['WARN', 'ERROR']);
  });

  it('형식이 아닌 필터는 무시한다(백엔드로 흘려보내지 않는다)', async () => {
    await GET(makeEvent(ROOT, '?channelId=abc&actorId=-3&since=nope'));
    const body = post.mock.calls[0][1];
    expect(body).not.toHaveProperty('channel_id');
    expect(body).not.toHaveProperty('actor_id');
    expect(body).not.toHaveProperty('since');
  });

  it('커서는 (시각, id) 쌍이 모두 있을 때만 보낸다', async () => {
    await GET(makeEvent(ROOT, '?cursorAt=2026-07-29T00:00:00Z'));
    expect(post.mock.calls[0][1]).not.toHaveProperty('cursor_at');

    post.mockClear();
    await GET(makeEvent(ROOT, '?cursorAt=2026-07-29T00:00:00Z&cursorId=abc'));
    const body = post.mock.calls[0][1];
    expect(body.cursor_at).toContain('2026-07-29');
    expect(body.cursor_id).toBe('abc');
  });

  it('응답을 카멜케이스로 변환하고 커서를 정규화한다', async () => {
    post.mockResolvedValue({
      data: {
        records: [
          {
            event_id: 'e1',
            occurred_at: '2026-07-29T01:00:00Z',
            level: 'INFO',
            action: 'marketing.plan.generated',
            message: '기획서 생성',
            actor_id: 7,
            job_id: null,
            token_input: 100,
            token_output: 20,
            payload: { channel_id: 5, cost: { status: 'computed', micro_usd: 1234 } }
          }
        ],
        next_cursor_at: '2026-07-29T01:00:00Z',
        next_cursor_id: 'e1'
      }
    });

    const res = await GET(makeEvent(ROOT));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.records[0]).toMatchObject({
      eventId: 'e1',
      tokenInput: 100,
      tokenOutput: 20,
      payload: { channel_id: 5, cost: { micro_usd: 1234 } }
    });
    expect(body.data.nextCursor).toEqual({ at: '2026-07-29T01:00:00Z', id: 'e1' });
  });

  it('limit 은 백엔드 상한(200)까지만 허용하고, 없거나 이상하면 화면 기본값(50)을 쓴다', async () => {
    // CSV 내보내기가 왕복을 줄이려고 크게 요청한다. 브라우저 값을 그대로 흘리면 상한이 무의미해진다
    await GET(makeEvent(ROOT));
    expect(post.mock.calls[0][1].limit).toBe(50);

    post.mockClear();
    await GET(makeEvent(ROOT, '?limit=200'));
    expect(post.mock.calls[0][1].limit).toBe(200);

    post.mockClear();
    await GET(makeEvent(ROOT, '?limit=100000'));
    expect(post.mock.calls[0][1].limit).toBe(200);

    post.mockClear();
    await GET(makeEvent(ROOT, '?limit=0'));
    expect(post.mock.calls[0][1].limit).toBe(50);

    post.mockClear();
    await GET(makeEvent(ROOT, '?limit=abc'));
    expect(post.mock.calls[0][1].limit).toBe(50);
  });

  it('커서가 반쪽만 오면 마지막 페이지로 본다', async () => {
    post.mockResolvedValue({
      data: { records: [], next_cursor_at: '2026-07-29T01:00:00Z', next_cursor_id: null }
    });
    const body = await (await GET(makeEvent(ROOT))).json();
    expect(body.data.nextCursor).toBeNull();
  });

  it('billedOnly=true 면 billed_only 로 넘긴다', async () => {
    await GET(makeEvent(ROOT, '?billedOnly=true'));
    expect(post.mock.calls[0][1].billed_only).toBe(true);
  });

  it('billedOnly 는 정확히 true 일 때만 켜진다', async () => {
    // 존재 여부로 읽으면 필터를 끄는 요청('false')이 조용히 켜진다. 그러면 사용자는 목록이
    // 왜 좁아졌는지 알 방법이 없다(무료/미측정 활동이 통째로 사라진다)
    for (const query of ['', '?billedOnly=false', '?billedOnly=1', '?billedOnly']) {
      post.mockClear();
      await GET(makeEvent(ROOT, query));
      expect(post.mock.calls[0][1].billed_only).toBeUndefined();
    }
  });

  it('조건 전체 건수(total)를 그대로 통과시킨다', async () => {
    // 화면이 필터를 비교하는 근거다. 여기서 떨어지면 화면은 '불러온 행 수'로 되돌아가고,
    // 페이징 상태가 필터 결과처럼 보이는 원래 문제가 그대로 돌아온다
    post.mockResolvedValue({ data: { records: [], total: 93 } });
    const body = await (await GET(makeEvent(ROOT))).json();
    expect(body.data.total).toBe(93);
  });

  it('이어보기 응답처럼 total 이 없으면 null 로 준다', async () => {
    // 총계는 첫 페이지에만 실린다. 없을 때 0 으로 접으면 '조건에 0건'과 구분되지 않는다
    post.mockResolvedValue({ data: { records: [] } });
    const body = await (await GET(makeEvent(ROOT))).json();
    expect(body.data.total).toBeNull();
  });
});
