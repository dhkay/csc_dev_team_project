// 보관함 BFF: 버전이 저장소를 정하고, 스코프는 세션에서 나온다.
//
// 두 가지를 못박는다. (1) 원천과 최종을 나누지 않는 버전에서는 보관물이 원천 표에서 온다: 화면은
// 버전만 실어 보내므로 이 판정이 틀리면 조용히 다른 표를 고친다. (2) 목록은 조직 공용이고 이동은
// 소유이며 삭제는 관리급까지다: 셋 다 어긋나면 조용히 새는 종류다.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrgPosition } from '@csc/entitlements';

const get = vi.fn();
const post = vi.fn();
const del = vi.fn();

vi.mock('$lib/infrastructure/http/serverClientInstances', () => ({
  serverMarketingClient: () => ({ GET: get, POST: post, DELETE: del })
}));
// 서명 URL 재구성은 이 테스트의 관심사가 아니다(별도 모듈): 원본을 그대로 통과시킨다.
// 두 표의 매퍼를 모두 막는다: 어느 쪽이 쓰이는지가 곧 이 파일의 검증 대상이라 한쪽만 막으면
// 다른 버전에서 실제 매퍼가 돌아 테스트가 그 모듈의 사정에 끌려간다.
vi.mock('$lib/server/marketing/videoFinalUrls', () => ({
  withVideoFinalUrls: (x: unknown) => x
}));
vi.mock('$lib/server/marketing/videoProjectUrls', () => ({
  withVideoProjectUrls: (x: unknown) => x
}));

const list = await import('../../../../../src/routes/api/marketing/archive/+server');
const entry = await import('../../../../../src/routes/api/marketing/archive/[id]/+server');
const restore = await import(
  '../../../../../src/routes/api/marketing/archive/[id]/restore/+server'
);

type FakeUser = {
  organization?: { id: number } | null;
  role?: string;
  position?: OrgPosition | null;
};

/**
 * 기본 쿼리에 `version` 이 있는 이유: 보관함은 버전 스코프 자원이라 BFF 가 버전 없는 요청을 400 으로
 * 막는다(requireOrgUserVersion). 버전을 뺀 경우는 아래 전용 케이스가 따로 확인한다.
 */
function makeEvent(user: FakeUser | null, { id = '5', query = '?version=v1.5' } = {}) {
  return {
    params: { id },
    url: new URL(`http://localhost/api/marketing/archive${query}`),
    locals: {
      accessToken: user ? 'token' : undefined,
      userId: 7,
      getUser: async () => user
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const MEMBER: FakeUser = { organization: { id: 12 }, role: 'ADMIN', position: null };
const TEAM_LEADER: FakeUser = {
  organization: { id: 12 },
  role: 'ADMIN',
  position: OrgPosition.TeamLeader
};
const ROOT: FakeUser = { organization: { id: 12 }, role: 'ROOT', position: null };
const REPRESENTATIVE: FakeUser = {
  organization: { id: 12 },
  role: 'ADMIN',
  position: OrgPosition.Representative
};

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: [] });
  post.mockReset().mockResolvedValue({ data: { id: 5 } });
  del.mockReset().mockResolvedValue({ data: undefined });
});

/** 백엔드로 나간 삭제 URL 의 쿼리 하나 */
function sentParam(name: string): string | null {
  return new URL(`http://x${del.mock.calls[0][0]}`).searchParams.get(name);
}

// 화면은 버전만 실어 보낸다. 어느 표에서 보관물이 오는지는 이 계층이 정하며, 그것이 이 파일에서
// 가장 조용히 틀릴 수 있는 값이다(틀려도 200 이 나가고 목록만 비어 보인다)
describe('보관물의 저장소는 버전이 정한다', () => {
  it.each([
    ['v1.0', 'video-finals'],
    ['v1.5', 'video-projects']
  ])('%s 의 보관함은 %s 자원에서 온다', async (version, resource) => {
    await list.GET(makeEvent(MEMBER, { query: `?version=${version}` }));
    expect(get.mock.calls[0][0]).toContain(`/v/${version}/${resource}/archive`);
  });

  it('보내기와 꺼내기와 삭제도 같은 자원을 쓴다(한 항목이 세 경로에서 갈리지 않게)', async () => {
    await entry.POST(makeEvent(MEMBER, { query: '?version=v1.5' }));
    await restore.POST(makeEvent(MEMBER, { query: '?channelId=3&version=v1.5' }));
    await entry.DELETE(makeEvent(MEMBER, { query: '?version=v1.5' }));

    expect(post.mock.calls[0][0]).toBe('/v/v1.5/video-projects/5/archive');
    expect(post.mock.calls[1][0]).toBe('/v/v1.5/video-projects/5/unarchive');
    expect(del.mock.calls[0][0]).toContain('/v/v1.5/video-projects/5/archived');
  });
});

describe('보관함 목록 (GET /archive)', () => {
  it('도구 사용자면 자기 보관함을 볼 수 있다(직책 게이트 없음)', async () => {
    const res = await list.GET(makeEvent(MEMBER, { query: '?channelId=3&version=v1.5' }));
    expect(res.status).toBe(200);
  });

  it('개인 축(작업자/채널)을 싣지 않는다: 보관함은 조직 공용이다', async () => {
    // ownerUserId 를 실으면 남이 만든 보관물이 목록에서 빠진다. channelId 를 실으면 그보다 나쁘다:
    //   채널이 개인 소유라 남의 보관물은 어떤 채널로도 걸러지지 않아 목록이 사실상 내 것만 남는다
    await list.GET(makeEvent(MEMBER, { query: '?version=v1.5' }));
    const url = get.mock.calls[0][0] as string;
    expect(url).toContain('organizationId=12');
    expect(url).not.toContain('ownerUserId');
    expect(url).not.toContain('channelId');
  });

  it('channelId 없이도 200: 보관함은 채널로 나뉘지 않는다', async () => {
    const res = await list.GET(makeEvent(MEMBER, { query: '?version=v1.5' }));
    expect(res.status).toBe(200);
    expect(get).toHaveBeenCalled();
  });

  it('version 이 없으면 400: 버전을 기본으로 접지 않는다', async () => {
    // 조용히 기본 버전으로 접으면 v1.0 화면이 v1.5 보관함을 200 으로 받는다. 그 오답은 화면을
    //   보고서야 드러나므로, 버전을 말하지 않은 요청은 실패시킨다
    const res = await list.GET(makeEvent(MEMBER, { query: '' }));
    expect(res.status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  it('비로그인은 401', async () => {
    const res = await list.GET(makeEvent(null, { query: '?version=v1.5' }));
    expect(res.status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('보관함 이동 (POST /:id, POST /:id/restore)', () => {
  it('보내기는 세션 사용자를 ownerUserId 로 실어 보낸다(백엔드가 소유를 검증)', async () => {
    const res = await entry.POST(makeEvent(MEMBER));
    expect(res.status).toBe(200);
    expect(post).toHaveBeenCalledWith('/v/v1.5/video-projects/5/archive', {
      organizationId: 12,
      ownerUserId: 7
    });
  });

  it('꺼내기는 채널을 함께 싣는다: 꺼낸 항목이 들어갈 작업 공간을 정해야 한다', async () => {
    // 채널을 빼면 남이 만든 항목이 그 사람 채널에 남아 꺼낸 사람 눈에는 사라진 것처럼 보인다
    const res = await restore.POST(makeEvent(MEMBER, { query: '?channelId=3&version=v1.5' }));
    expect(res.status).toBe(200);
    expect(post).toHaveBeenCalledWith('/v/v1.5/video-projects/5/unarchive', {
      organizationId: 12,
      ownerUserId: 7,
      channelId: 3
    });
  });

  it('꺼내기에 channelId 가 없으면 400(백엔드 호출 없음)', async () => {
    const res = await restore.POST(makeEvent(MEMBER));
    expect(res.status).toBe(400);
    expect(post).not.toHaveBeenCalled();
  });

  it('비로그인은 401(양방향)', async () => {
    expect((await entry.POST(makeEvent(null))).status).toBe(401);
    expect((await restore.POST(makeEvent(null))).status).toBe(401);
    expect(post).not.toHaveBeenCalled();
  });

  it('잘못된 id 는 400(백엔드 호출 없음)', async () => {
    const res = await entry.POST(makeEvent(MEMBER, { id: 'abc' }));
    expect(res.status).toBe(400);
    expect(post).not.toHaveBeenCalled();
  });
});

// 보관함 삭제는 만든 사람 또는 관리급(대표/팀장) 이다. 열람은 조직 전체지만 삭제는 되돌릴 수
// 없는 손실이라 전원에게 열지 않고, 공용 공간을 정리할 주체는 필요하다. 판정은 BFF 가 하고
// (세션의 직책을 아는 곳이 여기다) 백엔드는 그 결과를 manageAll 로 받아 질의를 고른다
describe('보관함 삭제 (DELETE /:id)', () => {
  it.each([
    ['루트', ROOT],
    ['대표', REPRESENTATIVE],
    ['팀장', TEAM_LEADER]
  ])('%s는 manageAll 을 실어 남의 보관물도 지울 수 있다', async (_label, user) => {
    const res = await entry.DELETE(makeEvent(user));
    expect(res.status).toBe(200);
    expect(sentParam('manageAll')).toBe('true');
    // 소유자 대신 요청한 사람이 실린다: 활동 로그의 행위자가 된다
    expect(sentParam('ownerUserId')).toBe('7');
  });

  it('일반 구성원은 manageAll 을 싣지 않는다(넓은 쪽이 기본값이 되지 않게)', async () => {
    // 값이 없으면 백엔드가 소유 질의로 거른다. 남의 것을 지우려 하면 조용히 아무 일도 없다
    const res = await entry.DELETE(makeEvent(MEMBER));
    expect(res.status).toBe(200);
    expect(sentParam('manageAll')).toBeNull();
  });

  it('소유자와 조직을 함께 실어 보낸다(로그 귀속 + 테넌트 스코프)', async () => {
    await entry.DELETE(makeEvent(ROOT));
    expect(sentParam('organizationId')).toBe('12');
    expect(sentParam('ownerUserId')).toBe('7');
  });

  it('비로그인은 401, 잘못된 id 는 400(백엔드 호출 없음)', async () => {
    expect((await entry.DELETE(makeEvent(null))).status).toBe(401);
    expect((await entry.DELETE(makeEvent(MEMBER, { id: '0' }))).status).toBe(400);
    expect(del).not.toHaveBeenCalled();
  });
});
