// 채널 BFF: 조직 스코프는 세션에서 나온다는 것을 고정한다.
//
// organizationId 를 클라이언트 값에서 받으면 남의 조직 데이터를 지목할 수 있고, 빠뜨리면 백엔드가
// 스코프 없이 조회한다. 둘 다 화면에는 정상으로 보이는 종류의 사고라 여기서 못박는다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();

vi.mock('$lib/infrastructure/http/serverClientInstances', () => ({
  serverMarketingClient: () => ({ GET: get })
}));

const channels = await import('../../../../../../src/routes/api/marketing/channels/+server');

const ORG = 12;
const SESSION_USER = 7;

type FakeUser = { organization?: { id: number } | null; role?: string };
const MEMBER: FakeUser = { organization: { id: ORG }, role: 'ADMIN' };

function makeEvent(user: FakeUser | null) {
  return {
    params: {},
    url: new URL('http://localhost/api/marketing/channels'),
    request: { json: async () => ({}) },
    locals: {
      accessToken: user ? 'token' : undefined,
      userId: user ? SESSION_USER : undefined,
      getUser: async () => user
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/** 백엔드로 나간 URL 의 쿼리 하나를 읽는다. */
function sentQuery(fn: typeof get, key: string): string | null {
  return new URL(`http://x${fn.mock.calls[0][0]}`).searchParams.get(key);
}

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: [] });
});

describe('읽기 라우트가 세션 조직으로 스코프를 좁힌다', () => {
  it('채널 목록: organizationId 를 싣는다', async () => {
    const res = await channels.GET(makeEvent(MEMBER));
    expect(res.status).toBe(200);
    expect(sentQuery(get, 'organizationId')).toBe(String(ORG));
  });

  it('비로그인은 401(백엔드 호출 없음)', async () => {
    const res = await channels.GET(makeEvent(null));
    expect(res.status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });
});
