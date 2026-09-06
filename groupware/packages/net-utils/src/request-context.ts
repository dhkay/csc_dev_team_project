/**
 * 요청 상관관계 컨텍스트(trace/request id): 서버 간 호출을 하나로 꿰는 값
 * 계약: docs/specs/service-http-contract.md §4.
 *
 * 두 개를 구분한다.
 *  - traceId   : 사용자 행위 1건의 끝에서 끝까지. 최초 진입점(BFF)에서 만들고 이후 홉은 그대로 전달
 *  - requestId : 이 홉의 HTTP 요청 1건. 홉마다 새로 생성
 *
 * 이 코드는 모든 요청에서 돈다. 트래픽이 늘어도 병목이 되지 않도록 넷을 지킨다.
 *  1. AsyncLocalStorage 인스턴스는 프로세스당 하나. ALS 는 개수에 비례해 비용이 는다.
 *  2. `run()` 은 요청당 한 번만. 비동기 홉마다 감싸면 비용이 선형으로 는다.
 *  3. 컨텍스트 객체는 생성 후 변경하지 않는다. 방어적 복사가 필요 없어진다.
 *  4. id 생성은 풀링된 CSPRNG. randomUUID 보다 크게 빠르지는 않지만 문자열이 16자라 헤더가 절반이고
 *     Python 측(16자 hex)과 맞출 수 있다. 재현: request-context.bench.mjs
 *     Python 쪽은 정반대로 풀링이 손해라 `os.urandom(8).hex()` 를 쓴다.
 */
import { randomFillSync } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

/** 전달 헤더 이름(소문자: Node 는 인바운드 헤더를 소문자로 정규화한다) */
export const TRACE_ID_HEADER = 'x-trace-id';
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * 상관관계 id 의 최대 길이. 외부에서 들어온 값을 그대로 쓰면 로그 저장소로 흘러가므로
 * 반드시 잘라낸다(무한 길이 헤더로 로그 컬럼/메모리를 밀어내는 것을 차단)
 */
const MAX_ID_LENGTH = 64;

/** 허용 문자: 영숫자/하이픈만. 로그 인젝션(개행, 제어문자)과 파서 혼란을 원천 차단 */
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface RequestContext {
  // 끝에서 끝까지 유지되는 식별자
  readonly traceId: string;
  // 이 홉의 요청 식별자
  readonly requestId: string;
  // 조직 스코프(있으면). 로그 엔벨로프의 organization_id 로 전달
  readonly organizationId?: number;
  // 행위 주체(있으면)
  readonly userId?: number;
}

/**
 * ALS 인스턴스는 프로세스당 하나여야 해서 globalThis 에 걸어 공유
 *
 * 왜 모듈 스코프 `new AsyncLocalStorage()` 로 충분하지 않은가: 이 패키지는 두 엔트리(`.`,
 * `./nest`)로 번들되고 tsup 은 `splitting: false` 라 공유 모듈을 각 번들에 복제한다. 그러면
 * request-context 사본이 둘 생겨 저장소도 둘이 된다. 결과는 조용한 오작동이다. NestJS
 * `correlationIdMiddleware`(`./nest` 번들)가 컨텍스트를 세워도 `getTraceId()`(`.` 번들)가
 * undefined 를 돌려주고 로그에 trace 가 null 로 남음. 에러도 없음
 *
 * globalThis 키로 묶으면 사본이 몇 개든 같은 저장소를 쓴다(엔트리를 더 늘려도 안전)
 */
const STORAGE_KEY = '__csc_net_utils_request_context__';
type GlobalWithStorage = typeof globalThis & {
  [STORAGE_KEY]?: AsyncLocalStorage<RequestContext>;
};
const globalWithStorage = globalThis as GlobalWithStorage;
const storage: AsyncLocalStorage<RequestContext> =
  globalWithStorage[STORAGE_KEY] ??
  (globalWithStorage[STORAGE_KEY] = new AsyncLocalStorage<RequestContext>());

// ---- id 생성 (풀링 CSPRNG) ----
// os 엔트로피를 요청마다 부르지 않고 큰 버퍼를 한 번에 채워 잘라 사용
// 8바이트(64비트) × 512개 = 4KB. 64비트면 충돌 확률이 실질적으로 0
const ID_BYTES = 8;
const POOL_SIZE = ID_BYTES * 512;
let pool = Buffer.allocUnsafe(POOL_SIZE);
let poolOffset = POOL_SIZE; // 최초 호출에서 채우도록 소진 상태로 시작

/** 16자 hex 상관관계 id. */
export function generateId(): string {
  if (poolOffset >= POOL_SIZE) {
    randomFillSync(pool);
    poolOffset = 0;
  }
  const id = pool.toString('hex', poolOffset, poolOffset + ID_BYTES);
  poolOffset += ID_BYTES;
  return id;
}

/**
 * 외부에서 들어온 상관관계 id 를 신뢰 가능한 형태로 정규화
 * 형식이 어긋나거나 비어 있으면 `null`. 호출부가 새로 만들게 함
 */
export function sanitizeCorrelationId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_ID_LENGTH) return null;
  return ID_PATTERN.test(trimmed) ? trimmed : null;
}

/** 현재 컨텍스트(없으면 undefined: 워커/크론 등 요청 밖 실행) */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getTraceId(): string | undefined {
  return storage.getStore()?.traceId;
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * 컨텍스트를 깔고 `fn` 을 실행한다. 요청당 한 번만 호출할 것
 * 반환값은 fn 의 반환값을 그대로 통과시킨다(동기, 비동기 모두)
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * 인바운드 헤더에서 컨텍스트 생성
 *  - traceId: 있으면 채택(끝에서 끝까지 유지), 없으면 생성 → 이 홉이 진입점이라는 뜻
 *  - requestId: 항상 새로 생성. 홉마다 다른 값이어야 "이 호출만" 을 집어낼 수 있음
 */
export function contextFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  extra?: { organizationId?: number; userId?: number },
): RequestContext {
  return {
    traceId: sanitizeCorrelationId(headers[TRACE_ID_HEADER]) ?? generateId(),
    requestId: generateId(),
    organizationId: extra?.organizationId,
    userId: extra?.userId,
  };
}

/**
 * 아웃바운드 요청에 실을 상관관계 헤더
 * 컨텍스트가 없으면(워커, 크론) 빈 객체. 헤더를 억지로 만들지 않음
 */
export function correlationHeaders(): Record<string, string> {
  const ctx = storage.getStore();
  if (!ctx) return {};
  return {
    'X-Trace-Id': ctx.traceId,
    // 다음 홉은 이 값을 부모로 보고 자기 requestId 를 새로 생성
    'X-Request-Id': ctx.requestId,
  };
}

/** `headers` 를 가진 요청 설정이면 무엇이든: axios 를 import 하지 않기 위한 구조적 타입 */
export interface CorrelatableRequestConfig {
  headers?: Record<string, unknown>;
}

/**
 * 브라우저 런타임인가. `typeof window` 를 직접 쓰지 않는 이유: 이 패키지는 DOM lib 없이
 * (`lib: ["ES2022"]`, `types: ["node"]`) 컴파일되므로 `window` 식별자가 존재하지 않음
 */
function isBrowserRuntime(): boolean {
  return typeof globalThis === 'object' && 'window' in globalThis;
}

/**
 * 요청 설정에 상관관계 헤더를 채워 넣는다(axios 인터셉터로 바로 쓸 수 있는 형태)
 *
 * axios 타입을 import 하지 않고 구조적 타입만 요구해 코어의 의존성 0 유지
 * 사용: `instance.interceptors.request.use(applyCorrelationHeaders)`
 *
 * 브라우저에서는 아무것도 하지 않는다. 이 모듈은 node:async_hooks 에 의존하므로 애초에
 * 클라이언트 번들에 들어가면 안 되지만, 이중 안전장치를 둔다(serviceToken 인터셉터와 같은 규약)
 */
export function applyCorrelationHeaders<T extends CorrelatableRequestConfig>(config: T): T {
  if (isBrowserRuntime()) return config;

  const headers = correlationHeaders();
  const keys = Object.keys(headers);
  if (keys.length === 0) return config;

  const target = (config.headers ??= {});
  for (const key of keys) {
    // 호출부가 명시적으로 지정했으면 그것을 존중
    if (target[key] === undefined) target[key] = headers[key];
  }
  return config;
}

/**
 * 진입점(BFF)용: 요청 1건을 상관관계 컨텍스트 안에서 처리하고 응답에 id 반환
 *
 * BFF 는 시스템의 진입점이라 브라우저 요청에는 trace 가 없다. 여기서 만들어야 이후 모든
 * 백엔드 홉이 그 값을 승계. 즉 "기획서 생성 1건" 의 trace 는 사용자가 버튼을 누른 순간 생성
 *
 * 프레임워크 비종속(Web `Headers`/`Response` 만 사용). SvelteKit `handle` 훅에서 바로 사용
 */
export async function withCorrelationScope(
  headers: Pick<Headers, 'get'>,
  fn: () => Response | Promise<Response>,
): Promise<Response> {
  const context = contextFromHeaders({
    [TRACE_ID_HEADER]: headers.get(TRACE_ID_HEADER) ?? undefined,
  });

  const response = await runWithRequestContext(context, fn);

  // 호출자(브라우저 devtools)가 서버 로그를 바로 찾을 수 있게 반환
  response.headers.set(TRACE_ID_HEADER, context.traceId);
  response.headers.set(REQUEST_ID_HEADER, context.requestId);
  return response;
}
