import { describe, it, expect, vi } from 'vitest';
import { createHttpClient } from './http-client';
import { HttpError } from './http-error';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * fetch 대역. 인자를 명시적으로 선언해야 `mock.calls[0]` 이 `[url, init]` 튜플로 추론된다.
 * (인자 없는 `vi.fn(async () => …)` 는 calls 가 `[]` 로 잡혀 구조분해가 never 가 된다)
 */
function mockFetch(respond: () => Response | Promise<Response>) {
  return vi.fn(async (_url: string, _init?: RequestInit) => respond());
}

/** 대역 → `typeof fetch` 캐스팅(시그니처가 완전히 같지는 않아 한 곳에서만 처리) */
const asFetch = (m: ReturnType<typeof mockFetch>) => m as unknown as typeof fetch;

describe('createHttpClient', () => {
  it('성공 응답 JSON 을 파싱해 반환하고 X-Service-Token 을 주입한다', async () => {
    const fetchImpl = mockFetch(() => jsonResponse(200, { ok: true }));
    const client = createHttpClient({
      baseUrl: 'http://svc',
      serviceToken: () => 'tok-123',
      fetchImpl: asFetch(fetchImpl),
    });

    const res = await client.post<{ ok: boolean }>('/jobs', { a: 1 });
    expect(res).toEqual({ ok: true });

    const [url, init] = fetchImpl.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(url).toBe('http://svc/jobs');
    expect(init?.method).toBe('POST');
    expect(headers['X-Service-Token']).toBe('tok-123');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('4xx 는 봉투를 보존한 HttpError 로 던지고 재시도하지 않는다', async () => {
    const fetchImpl = mockFetch(() =>
      jsonResponse(409, { code: 'NAME_ALREADY_EXISTS', message: '중복', details: { x: 1 } }),
    );
    const client = createHttpClient({
      baseUrl: 'http://svc',
      retries: 3,
      fetchImpl: asFetch(fetchImpl),
    });

    await expect(client.post('/x', {})).rejects.toMatchObject({
      statusCode: 409,
      response: { data: { code: 'NAME_ALREADY_EXISTS', details: { x: 1 } } },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // 4xx → 재시도 없음
  });

  it('5xx 는 retries 만큼 재시도 후 던진다', async () => {
    const fetchImpl = mockFetch(() => jsonResponse(503, { message: 'down' }));
    const client = createHttpClient({
      baseUrl: 'http://svc',
      retries: 2,
      retryDelayMs: () => 0,
      fetchImpl: asFetch(fetchImpl),
    });

    await expect(client.get('/x')).rejects.toBeInstanceOf(HttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 최초 1 + 재시도 2
  });

  it('네트워크 실패는 503 HttpError 로 정규화', async () => {
    const fetchImpl = mockFetch(() => {
      throw new Error('ECONNREFUSED');
    });
    const client = createHttpClient({
      baseUrl: 'http://svc',
      fetchImpl: asFetch(fetchImpl),
    });
    await expect(client.get('/x')).rejects.toMatchObject({ statusCode: 503 });
  });
});
