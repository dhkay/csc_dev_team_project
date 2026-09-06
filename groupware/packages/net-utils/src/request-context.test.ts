/**
 * 상관관계 컨텍스트 불변식 잠금 (TS 측)
 * Python 측 동일 테스트: apps/api/fastapi/net-utils/tests/test_request_context.py
 *
 * 지키는 것 두 가지:
 * 1. trace 는 이어지고 request 는 갈린다. 뒤집히면 "행위 1건 전체"와 "이 호출 하나"를 구분 못 한다.
 * 2. 외부 입력을 그대로 믿지 않는다. trace 는 헤더로 들어와 로그 저장소까지 흘러간다.
 */
import { describe, expect, it } from 'vitest';

import {
  REQUEST_ID_HEADER,
  TRACE_ID_HEADER,
  contextFromHeaders,
  correlationHeaders,
  generateId,
  getRequestContext,
  getTraceId,
  runWithRequestContext,
  sanitizeCorrelationId,
} from './request-context';

describe('generateId', () => {
  it('16자 hex 를 만든다', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('풀을 여러 번 리필해도 겹치지 않는다', () => {
    // 풀 크기(512개)보다 많이 뽑아 리필 경로를 지나게 한다.
    const ids = new Set(Array.from({ length: 5000 }, generateId));
    expect(ids.size).toBe(5000);
  });
});

describe('sanitizeCorrelationId', () => {
  it('정상 형식은 통과시킨다', () => {
    for (const good of ['abc123', 'a-b_c', '0123456789abcdef', 'A'.repeat(64)]) {
      expect(sanitizeCorrelationId(good)).toBe(good);
    }
  });

  it('제어문자/공백이 섞이면 거부한다. 로그 인젝션 차단', () => {
    for (const bad of ['abc\ndef', 'abc def', 'abc\r\n[FAKE]', '<script>', 'a;b']) {
      expect(sanitizeCorrelationId(bad)).toBeNull();
    }
  });

  it('너무 길면 거부한다. 로그 컬럼/메모리 밀어내기 차단', () => {
    expect(sanitizeCorrelationId('a'.repeat(65))).toBeNull();
  });

  it('문자열이 아니면 거부한다', () => {
    for (const bad of [undefined, null, 123, {}, ['a']]) {
      expect(sanitizeCorrelationId(bad)).toBeNull();
    }
  });
});

describe('contextFromHeaders', () => {
  it('trace 는 이어받고 request 는 새로 만든다', () => {
    const incoming = 'abc123def456';
    const first = contextFromHeaders({ [TRACE_ID_HEADER]: incoming });
    const second = contextFromHeaders({ [TRACE_ID_HEADER]: incoming });

    expect(first.traceId).toBe(incoming);
    expect(second.traceId).toBe(incoming);
    expect(first.requestId).not.toBe(second.requestId);
  });

  it('trace 가 없으면 진입점으로 보고 생성한다', () => {
    const ctx = contextFromHeaders({});
    expect(ctx.traceId).toMatch(/^[0-9a-f]{16}$/);
    expect(ctx.traceId).not.toBe(ctx.requestId);
  });

  it('형식이 어긋난 trace 는 버리고 새로 만든다', () => {
    const ctx = contextFromHeaders({ [TRACE_ID_HEADER]: 'bad value!' });
    expect(ctx.traceId).not.toBe('bad value!');
    expect(ctx.traceId).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('컨텍스트 전파', () => {
  it('컨텍스트 밖에서는 헤더를 만들지 않는다', () => {
    expect(getRequestContext()).toBeUndefined();
    expect(correlationHeaders()).toEqual({});
  });

  it('컨텍스트 안에서 아웃바운드 헤더가 실린다', () => {
    const ctx = { traceId: 't-1', requestId: 'r-1' };
    runWithRequestContext(ctx, () => {
      expect(getTraceId()).toBe('t-1');
      expect(correlationHeaders()).toEqual({ 'X-Trace-Id': 't-1', 'X-Request-Id': 'r-1' });
    });
  });

  it('await 경계를 넘어 유지된다', async () => {
    const ctx = { traceId: 't-async', requestId: 'r-async' };
    await runWithRequestContext(ctx, async () => {
      await new Promise((r) => setTimeout(r, 1));
      expect(getTraceId()).toBe('t-async');
    });
  });

  it('동시 요청끼리 컨텍스트가 새지 않는다', async () => {
    // 컨텍스트 누출은 곧 로그가 남의 조직으로 기록되는 사고다.
    const seen: Record<string, string | undefined> = {};
    const handler = (name: string) =>
      runWithRequestContext({ traceId: name, requestId: name }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        seen[name] = getTraceId();
      });

    await Promise.all([handler('a'), handler('b'), handler('c')]);
    expect(seen).toEqual({ a: 'a', b: 'b', c: 'c' });
  });

  it('실행이 끝나면 컨텍스트가 남지 않는다', () => {
    runWithRequestContext({ traceId: 't', requestId: 'r' }, () => undefined);
    expect(getRequestContext()).toBeUndefined();
  });
});

describe('헤더 이름', () => {
  it('Python 측과 같은 소문자 이름을 쓴다', () => {
    // 한 글자만 달라도 상관관계가 조용히 끊긴다.
    expect(TRACE_ID_HEADER).toBe('x-trace-id');
    expect(REQUEST_ID_HEADER).toBe('x-request-id');
  });
});

describe('저장소 단일 인스턴스', () => {
  /**
   * 이 패키지는 두 엔트리(`.`, `./nest`)로 번들되고 tsup 이 `splitting: false` 라 공유 모듈을
   * 각 번들에 복제한다. 저장소가 모듈 스코프면 사본마다 따로 생겨,
   * NestJS 미들웨어(`./nest`)가 세운 컨텍스트를 `getTraceId()`(`.`)가 못 본다.
   * 에러 없이 trace 가 null 로만 남는 조용한 오작동이라 여기서 잠근다.
   */
  it('globalThis 에 걸린 저장소를 재사용한다. 번들이 복제돼도 하나여야 한다', () => {
    const key = '__csc_net_utils_request_context__';
    expect((globalThis as Record<string, unknown>)[key]).toBeDefined();
  });

  it('globalThis 저장소로 세운 컨텍스트를 이 모듈의 접근자가 읽는다', () => {
    const key = '__csc_net_utils_request_context__';
    const shared = (globalThis as Record<string, unknown>)[key] as {
      run<T>(ctx: unknown, fn: () => T): T;
    };
    // 다른 사본이 하는 것과 같은 방식(공유 저장소에 직접 run)으로 컨텍스트를 세운다.
    const seen = shared.run({ traceId: 'from-other-copy', requestId: 'r' }, () => getTraceId());
    expect(seen).toBe('from-other-copy');
  });
});
