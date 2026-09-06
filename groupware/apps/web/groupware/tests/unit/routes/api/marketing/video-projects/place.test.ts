// 작업 공간 배치 BFF: 누가 무엇을 배치하는지를 서버가 정한다.
//
// 브라우저가 정하는 것은 둘뿐이다(어느 영상인지, 어느 그림을 함께 붙일지). 조직과 작업자와 버전은
// 세션과 주소에서 나온다. 그 경계가 새면 남의 영상을 자기 작업 공간에 놓게 되므로 여기서 못박는다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn();

vi.mock('$lib/infrastructure/http/serverClientInstances', () => ({
  serverMarketingClient: () => ({ POST: post })
}));
// 서명 URL 재구성은 별도 모듈의 관심사다: 원본을 그대로 통과시킨다.
vi.mock('$lib/server/marketing/videoProjectUrls', () => ({
  withVideoProjectUrls: (x: unknown) => x
}));

const place = await import(
  '../../../../../../src/routes/api/marketing/video-projects/[id]/place/+server'
);

type FakeUser = { organization?: { id: number } | null; role?: string; position?: null };
const MEMBER: FakeUser = { organization: { id: 12 }, role: 'ADMIN', position: null };

function makeEvent(user: FakeUser | null, body: unknown, { id = '100', query = '?version=v1.5' } = {}) {
  return {
    params: { id },
    url: new URL(`http://localhost/api/marketing/video-projects/${id}/place${query}`),
    request: { json: async () => body },
    locals: {
      accessToken: user ? 'token' : undefined,
      userId: 7,
      getUser: async () => user
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  post.mockReset().mockResolvedValue({ data: { id: 100 } });
});

describe('작업 공간 배치 (POST /video-projects/:id/place)', () => {
  it('스코프를 세션과 주소에서 도출해 싣는다(브라우저가 정하지 않는다)', async () => {
    await place.POST(makeEvent(MEMBER, { thumbnailUploadId: 'thumb-1' }));

    expect(post.mock.calls[0][0]).toBe('/v/v1.5/video-projects/100/place');
    expect(post.mock.calls[0][1]).toEqual({
      organizationId: 12,
      ownerUserId: 7,
      thumbnailUploadId: 'thumb-1'
    });
  });

  it('그림 없이도 배치한다', async () => {
    // 캔버스를 옮기지 못하는 경우가 있고, 그때 배치까지 막으면 만들어진 영상이 어느 목록에도 없다
    for (const body of [null, {}, { thumbnailUploadId: '   ' }, { thumbnailUploadId: 3 }]) {
      post.mockClear();
      const res = await place.POST(makeEvent(MEMBER, body));

      expect(res.status).toBe(200);
      // 빈 값을 실어 보내면 백엔드가 "그림이 있다" 로 읽어 확정할 수 없는 자산을 기다린다
      expect(post.mock.calls[0][1]).not.toHaveProperty('thumbnailUploadId');
    }
  });

  it('영상 id 가 잘못되면 400 이다', async () => {
    const res = await place.POST(makeEvent(MEMBER, {}, { id: 'x' }));

    expect(res.status).toBe(400);
    expect(post).not.toHaveBeenCalled();
  });

  it('버전이 없으면 400 이다(산출물은 버전 소유라 어느 워크스페이스인지 정해져야 한다)', async () => {
    const res = await place.POST(makeEvent(MEMBER, {}, { query: '' }));

    expect(res.status).toBe(400);
    expect(post).not.toHaveBeenCalled();
  });

  it('로그인하지 않았으면 백엔드를 부르지 않는다', async () => {
    const res = await place.POST(makeEvent(null, {}));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(post).not.toHaveBeenCalled();
  });
});
