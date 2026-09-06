// 타입드 BFF 클라이언트 + 라우트 계약 프리미티브(앱 공용). 서버쪽 server/http/bff.ts 의 클라이언트 대칭
// 엔드포인트당 { method, path, Input, Output } 을 feature 의 <feature>Contract.ts 에 정의하고,
// client api 는 bff(route, input) 로 호출한다(런타임은 run() + frontClient() 그대로: 타입만 부여)
import { frontClient } from './clientInstances';
import { run, type ApiResult } from './apiResult';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * 엔드포인트 타입 계약. I=요청 body, O=응답 data, P=경로 파라미터
 * __input/__output 은 팬텀(런타임 미사용): 제네릭 I/O 를 구조적으로 보존해 bff 가 추론한다.
 */
export interface RouteDef<I = void, O = unknown, P = void> {
  method: HttpMethod;
  path: string | ((params: P) => string);
  readonly __input?: I;
  readonly __output?: O;
}

/** 계약 1건 정의. I/O(/P) 는 명시적 타입 인자로 준다: defineRoute<Body, Data>('POST', ROUTES.X) */
export function defineRoute<I = void, O = unknown, P = void>(
  method: HttpMethod,
  path: string | ((params: P) => string)
): RouteDef<I, O, P> {
  return { method, path };
}

/**
 * 타입 클라이언트: 계약대로 frontClient 를 호출하고 봉투를 ApiResult 로 정규화한다.
 * 런타임은 기존 `run(() => frontClient()[method](path, input))` 와 동일(무동작변경, 타입만 강제)
 */
export function bff<I, O, P = void>(
  route: RouteDef<I, O, P>,
  input?: I,
  params?: P
): Promise<ApiResult<O>> {
  const path = typeof route.path === 'function' ? route.path(params as P) : route.path;
  const client = frontClient();
  switch (route.method) {
    case 'GET':
      return run<O>(() => client.GET(path));
    case 'POST':
      return run<O>(() => client.POST(path, input));
    case 'PATCH':
      return run<O>(() => client.PATCH(path, input));
    case 'PUT':
      return run<O>(() => client.PUT(path, input));
    case 'DELETE':
      return run<O>(() => client.DELETE(path, input));
  }
}
