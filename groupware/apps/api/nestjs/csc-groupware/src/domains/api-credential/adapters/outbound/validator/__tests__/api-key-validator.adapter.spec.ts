import { API_PROVIDER_CATALOG } from '../../../../core/domain';
import { ApiKeyValidatorAdapter, hasCredentialProbe } from '../api-key-validator.adapter';

describe('프로브 표와 카탈로그 verification', () => {
  it('두 선언이 서로 어긋나지 않는다', () => {
    // 어긋나면 화면이 거짓말을 한다. 확인용 호출이 없는데 카탈로그가 live 라고 하면 등록 화면은
    // "검증되었습니다" 라고 말하고, 등록한 사람은 생성이 실패할 때까지 키가 맞다고 믿는다.
    for (const meta of API_PROVIDER_CATALOG) {
      expect({ key: meta.key, hasProbe: hasCredentialProbe(meta.key) }).toEqual({
        key: meta.key,
        hasProbe: meta.verification === 'live',
      });
    }
  });
});

describe('Gemini 확인 호출', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('키를 URL 이 아니라 헤더로 보낸다', async () => {
    // Google 은 쿼리 문자열(?key=)도 받아 주므로, 그쪽으로 고쳐도 검증은 그대로 통과한다.
    // 달라지는 것은 조직의 키가 프록시와 액세스 로그에 평문으로 남는다는 것뿐이라, 바뀌어도
    // 아무 증상이 없다. 그래서 여기서 형태를 고정한다.
    const fetchSpy = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await new ApiKeyValidatorAdapter().validate('GEMINI', { apiKey: 'AQ.secret' });

    expect(result).toEqual({ valid: true });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('AQ.secret');
    expect(init.headers).toEqual({ 'x-goog-api-key': 'AQ.secret' });
  });
});

describe('실패 사유 추출', () => {
  const adapter = new ApiKeyValidatorAdapter();
  const originalFetch = global.fetch;

  /** 프로바이더가 이 본문으로 응답했다고 가정한다. */
  const respondWith = (status: number, body: unknown): void => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status })) as typeof fetch;
  };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('ElevenLabs 의 detail 형태에서 사유를 뽑는다', async () => {
    // 실제 응답 형태(FastAPI 관용). error/message 만 보던 예전 추출기는 이 사유를 놓쳐
    // "유효하지 않은 키" 라는 일반 문구로 뭉갰다. 잔액 소진과 폐기된 키가 구분되지 않는다.
    respondWith(401, {
      detail: { type: 'authentication_error', code: 'unauthorized', message: 'Invalid API key' },
    });

    const result = await adapter.validate('ELEVENLABS', { apiKey: 'sk_bad' });

    expect(result.valid).toBe(false);
    expect(result.message).toContain('Invalid API key');
  });

  it('사유를 못 뽑으면 상태 기반 문구로 떨어진다', async () => {
    respondWith(401, { unexpected: 'shape' });

    const result = await adapter.validate('ELEVENLABS', { apiKey: 'sk_bad' });

    expect(result.valid).toBe(false);
    expect(result.message).toContain('유효하지 않은 ElevenLabs API 키입니다.');
  });

  it('확인용 호출 경로가 없는 프로바이더는 호출하지 않고 통과시킨다', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await adapter.validate('HIGGSFIELD', { apiKey: 'k', apiSecret: 's' });

    expect(result).toEqual({ valid: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
