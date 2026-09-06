/**
 * 서버 간 HTTP 클라이언트 (fetch 기반, 의존성 0)
 * 계약: docs/specs/service-http-contract.md §3.
 *  - X-Service-Token 자동 주입 / 타임아웃 / 재시도(네트워크, 타임아웃, 5xx) / 정규화 에러(HttpError)
 */
import {
  HttpError,
  httpErrorFromNetwork,
  httpErrorFromResponse,
} from './http-error';
import { correlationHeaders } from './request-context';

export interface HttpClientOptions {
  // 베이스 URL (예: http://video-model:8000)
  baseUrl: string;
  // 호출마다 X-Service-Token 을 생성해 주입 (없으면 미주입)
  serviceToken?: () => string;
  // 모든 요청에 추가할 기본 헤더
  defaultHeaders?: Record<string, string>;
  // 요청 타임아웃(ms). 기본 10000.
  timeoutMs?: number;
  // 재시도 횟수(네트워크/타임아웃/5xx 한정). 기본 0.
  retries?: number;
  // 재시도 대기(ms). 기본 min(2^n, 30)*1000.
  retryDelayMs?: (attempt: number) => number;
  // 테스트/대체용 fetch 주입. 기본 global fetch.
  fetchImpl?: typeof fetch;
}

export interface HttpClient {
  get<T>(path: string, init?: RequestInit): Promise<T>;
  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  delete<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
}

const defaultDelay = (attempt: number) => Math.min(2 ** attempt, 30) * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const {
    baseUrl,
    serviceToken,
    defaultHeaders,
    timeoutMs = 10_000,
    retries = 0,
    retryDelayMs = defaultDelay,
    fetchImpl = fetch,
  } = options;

  async function once(
    method: string,
    path: string,
    body: unknown,
    init?: RequestInit,
  ): Promise<unknown> {
    // 상관관계 헤더를 먼저 깔고 defaultHeaders 가 덮을 수 있게 둔다(호출부 오버라이드 허용)
    // 컨텍스트가 없으면(워커/크론) 빈 객체라 비용이 사실상 0이다.
    const headers: Record<string, string> = { ...correlationHeaders(), ...defaultHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (serviceToken) headers['X-Service-Token'] = serviceToken();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        method,
        headers: { ...headers, ...(init?.headers as Record<string, string>) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      // 네트워크 실패/타임아웃(abort) → 503 (재시도 대상)
      throw httpErrorFromNetwork(
        controller.signal.aborted ? '서버 응답 시간이 초과되었습니다' : '서비스에 연결할 수 없습니다',
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    const data = text ? safeJson(text) : undefined;
    if (!res.ok) throw httpErrorFromResponse(res.status, data);
    return data;
  }

  async function request<T>(
    method: string,
    path: string,
    body: unknown,
    init?: RequestInit,
  ): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return (await once(method, path, body, init)) as T;
      } catch (err) {
        lastErr = err;
        if (attempt < retries && isRetryable(err)) {
          await sleep(retryDelayMs(attempt));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  return {
    get: <T>(path: string, init?: RequestInit) => request<T>('GET', path, undefined, init),
    post: <T>(path: string, body?: unknown, init?: RequestInit) =>
      request<T>('POST', path, body, init),
    patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
      request<T>('PATCH', path, body, init),
    delete: <T>(path: string, body?: unknown, init?: RequestInit) =>
      request<T>('DELETE', path, body, init),
  };
}

/** 네트워크/타임아웃(503) 또는 5xx 만 재시도. 4xx 는 재시도 안 함 */
function isRetryable(err: unknown): boolean {
  return err instanceof HttpError && err.statusCode >= 500;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
