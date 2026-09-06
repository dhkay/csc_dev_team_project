/**
 * 프로듀서 잠금: 이 파일이 지키는 건 로그 전달이 아니라 비즈니스 경로의 안전이다.
 *
 * 그래서 "잘 보내는가" 보다 "실패할 때 조용히 망가지지 않는가" 를 더 촘촘히 잠근다:
 * throw 하지 않는다, 오염된 배치가 버퍼를 막지 않는다, 유실이 카운터에 드러난다.
 */

import { describe, expect, it, vi } from 'vitest';
import { AiToolKey } from '@csc/entitlements';
import { LogKind, LogLevel, LogScope, PrincipalType } from '@csc/log-contracts';
import type { LogEnvelopeWire, LogInput } from '@csc/log-contracts';
import { LogProducer, type LogIngestReceipt } from './producer';
import { ACTIVITY_LOG_NAMESPACE, deterministicEventId } from './event-id';

const RECEIPT: LogIngestReceipt = { accepted: 1, rejected: 0, errors: [] };

function entry(overrides: Partial<LogInput> = {}): LogInput {
  return {
    kind: LogKind.Audit,
    level: LogLevel.Info,
    scope: LogScope.AiTool,
    service: 'csc-marketing',
    action: 'marketing.plan.generated',
    message: '기획서 생성',
    aiTool: AiToolKey.MarketingVideo,
    organizationId: 42,
    actor: { principalType: PrincipalType.OrganizationUser, actorId: 12 },
    ...overrides,
  };
}

/** 전송을 기록하는 대역. 필요하면 실패를 주입한다. */
function transportSpy(impl?: (records: LogEnvelopeWire[]) => Promise<LogIngestReceipt>) {
  const batches: LogEnvelopeWire[][] = [];
  const fn = vi.fn(async (records: LogEnvelopeWire[]) => {
    batches.push(records);
    return impl ? impl(records) : RECEIPT;
  });
  return { fn, batches };
}

function httpError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
}

describe('enqueue 는 절대 실패를 전파하지 않는다', () => {
  it('불변식 위반(AUDIT 인데 actor 없음)이어도 throw 하지 않고 카운터에만 남는다', () => {
    const { fn } = transportSpy();
    const producer = new LogProducer({ transport: fn, environment: 'test' });

    expect(() => producer.enqueue(entry({ actor: null }))).not.toThrow();
    expect(producer.stats().droppedInvalid).toBe(1);
    expect(producer.stats().buffered).toBe(0);
  });

  it('organizationId 가 0 이면 거부한다. 0 은 저장소의 플랫폼 전역 센티넬이다', () => {
    const { fn } = transportSpy();
    const producer = new LogProducer({ transport: fn, environment: 'test' });
    producer.enqueue(entry({ organizationId: 0 }));
    expect(producer.stats().droppedInvalid).toBe(1);
  });
});

describe('버퍼 상한', () => {
  it('넘치면 가장 오래된 것부터 버리고 카운터로 드러낸다', async () => {
    const { fn, batches } = transportSpy();
    const producer = new LogProducer({
      transport: fn,
      environment: 'test',
      maxBufferSize: 3,
      maxBatchSize: 100,
    });

    for (let i = 0; i < 5; i += 1) {
      producer.enqueue(entry({ message: `m${i}` }));
    }

    expect(producer.stats().droppedOverflow).toBe(2);
    await producer.flush();
    // 남은 3건은 가장 최신 3건(m2, m3, m4)이어야 한다.
    expect(batches[0]?.map((r) => r.message)).toEqual(['m2', 'm3', 'm4']);
  });
});

describe('전송 실패 분기', () => {
  it('4xx 는 재큐잉하지 않는다. 오염된 배치가 버퍼를 영구히 막으면 안 된다', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw httpError(400);
      return RECEIPT;
    });
    const producer = new LogProducer({ transport: fn, environment: 'test', maxBatchSize: 1 });

    producer.enqueue(entry({ message: '나쁜 배치' }));
    await producer.flush();
    expect(producer.stats().droppedTransport).toBe(1);
    expect(producer.stats().buffered).toBe(0);

    // 뒤이은 정상 배치는 그대로 전송돼야 한다(오염 없음 증명)
    producer.enqueue(entry({ message: '정상' }));
    await producer.flush();
    expect(producer.stats().sent).toBeGreaterThan(0);
    expect(producer.stats().buffered).toBe(0);
  });

  it('5xx 는 앞쪽에 되돌려 순서를 지키고 다음 플러시에 재시도한다', async () => {
    let fail = true;
    const { fn, batches } = transportSpy(async () => {
      if (fail) throw httpError(503);
      return RECEIPT;
    });
    const producer = new LogProducer({ transport: fn, environment: 'test', maxBatchSize: 2 });

    producer.enqueue(entry({ message: 'a' }));
    producer.enqueue(entry({ message: 'b' }));
    await producer.flush();
    expect(producer.stats().buffered).toBe(2);
    expect(producer.stats().droppedTransport).toBe(0);

    fail = false;
    await producer.flush();
    expect(producer.stats().buffered).toBe(0);
    // 재시도 배치의 순서가 보존되어야 한다.
    expect(batches.at(-1)?.map((r) => r.message)).toEqual(['a', 'b']);
  });

  it('네트워크 오류(상태 없음)도 재시도 대상이다', async () => {
    const fn = vi.fn(async () => {
      throw new Error('socket hang up');
    });
    const producer = new LogProducer({ transport: fn, environment: 'test', maxBatchSize: 1 });
    producer.enqueue(entry());
    await producer.flush();
    expect(producer.stats().buffered).toBe(1);
    expect(producer.stats().droppedTransport).toBe(0);
  });
});

describe('서버 영수증', () => {
  it('202 라도 rejected>0 이면 경고한다. 조용한 유실 금지', async () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const fn = vi.fn(async () => ({
      accepted: 0,
      rejected: 1,
      errors: [{ reason: 'INVALID_ENVELOPE', detail: 'bad' }],
    }));
    const producer = new LogProducer({ transport: fn, environment: 'test', maxBatchSize: 1, logger });

    producer.enqueue(entry());
    await producer.flush();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0]?.[0]).toContain('거부');
  });
});

describe('종료 드레인', () => {
  it('전송이 멈춰 있어도 마감 안에 반환한다', async () => {
    const fn = vi.fn(() => new Promise<LogIngestReceipt>(() => {}));
    const producer = new LogProducer({
      transport: fn,
      environment: 'test',
      maxBatchSize: 1,
      drainTimeoutMs: 50,
    });

    producer.enqueue(entry());
    const started = Date.now();
    await producer.shutdown();
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('종료 후 enqueue 는 무시된다', async () => {
    const { fn } = transportSpy();
    const producer = new LogProducer({ transport: fn, environment: 'test' });
    await producer.shutdown();
    producer.enqueue(entry());
    expect(producer.stats().buffered).toBe(0);
  });
});

describe('enqueue 시점 동결', () => {
  /**
   * 이 계층이 보장하는 것: enqueue 가 동기로 wire 레코드를 만들어 굳힌다는 것
   * 그래서 나중에(플러시 시점에) 무엇이 바뀌어도 이미 적재된 레코드는 영향받지 않는다.
   * 요청 컨텍스트에서 trace 를 뽑는 것은 어댑터의 책임이라 그 검증은 csc-marketing 쪽에 있다.
   * 여기서는 "값이 넘어온 순간 굳는다" 는 성질만 잠근다.
   */
  it('적재 후 입력 객체를 바꿔도 버퍼의 레코드는 변하지 않는다', async () => {
    const { fn, batches } = transportSpy();
    const producer = new LogProducer({ transport: fn, environment: 'test', maxBatchSize: 10 });

    const input = entry({ traceId: 'trace-A', requestId: 'req-A' });
    producer.enqueue(input);
    // 플러시 전에 원본을 오염시킨다(실제로는 재사용된 컨텍스트 객체가 이 역할을 한다)
    input.traceId = 'trace-B';
    input.message = '바뀐 메시지';
    await producer.flush();

    expect(batches[0]?.[0]?.trace_id).toBe('trace-A');
    expect(batches[0]?.[0]?.request_id).toBe('req-A');
    expect(batches[0]?.[0]?.message).toBe('기획서 생성');
  });

  it('occurred_at 과 event_id 가 적재 시점에 채워진다', async () => {
    const { fn, batches } = transportSpy();
    const producer = new LogProducer({ transport: fn, environment: 'test', maxBatchSize: 10 });
    producer.enqueue(entry());
    await producer.flush();

    expect(batches[0]?.[0]?.occurred_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(batches[0]?.[0]?.event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(batches[0]?.[0]?.environment).toBe('test');
  });
});

describe('deterministicEventId', () => {
  it('같은 입력은 항상 같은 id 를 준다', () => {
    const a = deterministicEventId(ACTIVITY_LOG_NAMESPACE, 'source:1:job-1:COMPLETED');
    const b = deterministicEventId(ACTIVITY_LOG_NAMESPACE, 'source:1:job-1:COMPLETED');
    expect(a).toBe(b);
  });

  it('다른 입력은 다른 id 를 준다', () => {
    const a = deterministicEventId(ACTIVITY_LOG_NAMESPACE, 'source:1:job-1:COMPLETED');
    const b = deterministicEventId(ACTIVITY_LOG_NAMESPACE, 'source:1:job-1:FAILED');
    expect(a).not.toBe(b);
  });

  it('버전 5 + RFC4122 변이 비트를 가진 유효한 UUID 다', () => {
    const id = deterministicEventId(ACTIVITY_LOG_NAMESPACE, 'x');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
