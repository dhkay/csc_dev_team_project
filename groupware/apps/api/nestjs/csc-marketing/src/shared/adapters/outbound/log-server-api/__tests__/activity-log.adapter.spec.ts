import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { correlationIdMiddleware } from '@csc/net-utils/nest';
import { ACTIVITY_LOG_PORT, type ActivityLogPort } from '../../../../domain/activity-log';
import { safeActivityLog } from '../safe-activity-log';
import { ActivityLogModule } from '../activity-log.module';
import { LogServerApiClientService } from '../log-server-api-client.service';
import { MarketingLogProducerService } from '../marketing-log-producer.service';

/**
 * 활동 로그 어댑터 + DI 배선 잠금
 *
 * 실제 모듈 그래프를 세워서 검증하는 이유: provider 누락은 컴파일이 아니라 부팅에서 터진다.
 * 스펙에서 모듈을 조립해 두면 그 실패를 CI 가 잡는다.
 *
 * 전송만 가짜로 바꿔치기하고 프로듀서/어댑터는 진짜를 쓴다. 엔벨로프 매핑까지 함께 잠긴다.
 */

/** log-server 클라이언트 대역: 보낸 배치를 기록한다. */
class FakeLogServerClient {
  readonly batches: { records: Record<string, unknown>[] }[] = [];
  async post<T>(_path: string, body?: unknown): Promise<T> {
    this.batches.push(body as { records: Record<string, unknown>[] });
    return { accepted: 1, rejected: 0, errors: [] } as T;
  }
}

/**
 * 앱과 같은 방식으로 조립한다. ConfigModule 은 앱에서 `isGlobal: true` 라 ActivityLogModule 이
 * 따로 import 하지 않는다(다른 도메인 모듈도 같은 관례). 테스트도 그 전제를 재현해야
 * "앱에서는 되는데 스펙에서만 안 되는" 가짜 실패가 안 생긴다.
 */
async function setup(transport?: FakeLogServerClient) {
  const client = transport ?? new FakeLogServerClient();
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({ APP_ENV: 'test', SERVICE_TOKEN_SECRET: 'test-secret' })],
      }),
      ActivityLogModule,
    ],
  })
    .overrideProvider(LogServerApiClientService)
    .useValue(client)
    .compile();

  const port = moduleRef.get<ActivityLogPort>(ACTIVITY_LOG_PORT);
  const producer = moduleRef.get(MarketingLogProducerService);
  return { client, port, producer, moduleRef };
}

const ENTRY = {
  organizationId: 42,
  actorUserId: 12,
  channelId: 7,
  version: 'v1.5' as const,
  action: 'saved_plan.created' as const,
  message: '기획안 저장: 촉촉 세럼',
  target: { kind: 'saved_plan' as const, id: 101 },
};

describe('ActivityLogAdapter', () => {
  it('DI 그래프가 해석된다. ACTIVITY_LOG_PORT 로 어댑터가 주입된다', async () => {
    const { port, moduleRef } = await setup();
    expect(typeof port.log).toBe('function');
    await moduleRef.close();
  });

  it('활동을 AUDIT 엔벨로프로 옮긴다', async () => {
    const { client, port, producer, moduleRef } = await setup();

    port.log(ENTRY);
    await producer['producer'].flush();

    const record = client.batches[0].records[0];
    expect(record.kind).toBe('AUDIT'); // TTL 없는 테이블 = 비용 이력 영구 보존
    expect(record.level).toBe('INFO');
    expect(record.scope).toBe('AI_TOOL');
    expect(record.ai_tool).toBe('marketing-video');
    expect(record.action).toBe('marketing.saved_plan.created'); // 접두사는 어댑터가 붙인다
    expect(record.organization_id).toBe(42);
    expect(record.actor).toEqual({ principal_type: 'ORGANIZATION_USER', actor_id: 12 });
    expect(record.environment).toBe('test');
    await moduleRef.close();
  });

  it('채널과 대상을 payload 의 snake_case 키로 싣는다. 나중에 컬럼 승격이 가능한 이름', async () => {
    const { client, port, producer, moduleRef } = await setup();

    port.log(ENTRY);
    await producer['producer'].flush();

    expect(client.batches[0].records[0].payload).toEqual({
      channel_id: 7,
      // 도구 버전: 조직 전체 원장에서 두 파이프라인을 가릴 유일한 근거(액션 이름은 둘이 같다)
      version: 'v1.5',
      target_kind: 'saved_plan',
      target_id: 101,
    });
    await moduleRef.close();
  });

  it('실패 활동은 WARN 으로 내려간다. 뷰어의 실패 필터 근거', async () => {
    const { client, port, producer, moduleRef } = await setup();

    port.log({ ...ENTRY, action: 'source.render_cancelled', failed: true, message: '렌더 취소' });
    await producer['producer'].flush();

    expect(client.batches[0].records[0].level).toBe('WARN');
    await moduleRef.close();
  });

  it('요청 컨텍스트의 trace/request id 를 기록 시점에 집어온다', async () => {
    const { client, port, producer, moduleRef } = await setup();

    // 앱이 쓰는 실제 미들웨어로 컨텍스트를 세운다(main.ts 의 app.use(correlationIdMiddleware))
    // 그리고 그 요청 밖에서 플러시한다. 주기 플러시가 정확히 이 모양이라, 이 순서가
    // "기록 시점에 굳는다" 를 검증하는 핵심이다.
    correlationIdMiddleware(
      { headers: { 'x-trace-id': 'traceA1b2c3d4e5f60789' } } as never,
      { setHeader: () => undefined } as never,
      () => port.log(ENTRY),
    );
    await producer['producer'].flush();

    const record = client.batches[0].records[0];
    // trace 는 인바운드 헤더에서 채택된다(홉을 넘어 이어지는 값)
    expect(record.trace_id).toBe('traceA1b2c3d4e5f60789');
    // request 는 홉마다 새로 생성된다. 값은 모르지만 존재하고 형식이 맞아야 한다.
    expect(record.request_id).toMatch(/^[A-Za-z0-9_-]+$/);
    await moduleRef.close();
  });

  it('dedupeKey 는 결정적 event_id 가 된다. 같은 전이를 두 번 관측해도 같은 id', async () => {
    const { client, port, producer, moduleRef } = await setup();

    port.log({ ...ENTRY, dedupeKey: 'source:1:job-1:COMPLETED' });
    port.log({ ...ENTRY, dedupeKey: 'source:1:job-1:COMPLETED' });
    await producer['producer'].flush();

    const [first, second] = client.batches[0].records;
    expect(first.event_id).toBe(second.event_id);
    await moduleRef.close();
  });

  it('비용 스냅샷을 payload.cost 로 싣고 토큰은 승격 컬럼으로 보낸다', async () => {
    const { client, port, producer, moduleRef } = await setup();

    port.log({
      ...ENTRY,
      action: 'plan.generated',
      usage: { tokenInput: 12_400, tokenOutput: 3_100 },
      cost: {
        status: 'computed',
        microUsd: 108_500,
        rateVersion: 'anthropic-sonnet5-intro',
        model: 'claude-sonnet-5',
        billing: 'org-key',
        units: { 'text-input-token': 12_400 },
      },
    });
    await producer['producer'].flush();

    const record = client.batches[0].records[0];
    // 토큰은 실제 컬럼으로 가야 usage_daily 집계에 잡힌다.
    expect(record.token_input).toBe(12_400);
    expect(record.token_output).toBe(3_100);
    expect(record.payload).toMatchObject({
      cost: {
        v: 1,
        status: 'computed',
        micro_usd: 108_500,
        rate_version: 'anthropic-sonnet5-intro',
        model: 'claude-sonnet-5',
        billing: 'org-key',
      },
    });
    await moduleRef.close();
  });

  it("금액을 모를 때는 micro_usd 를 아예 넣지 않는다. 0 으로 위장 금지", async () => {
    const { client, port, producer, moduleRef } = await setup();

    port.log({
      ...ENTRY,
      cost: { status: 'usage-missing', model: 'gpt-image-2', billing: 'org-key' },
    });
    await producer['producer'].flush();

    const cost = (client.batches[0].records[0].payload as { cost: Record<string, unknown> }).cost;
    expect(cost.status).toBe('usage-missing');
    expect('micro_usd' in cost).toBe(false);
    await moduleRef.close();
  });

  it('전송이 실패해도 log() 는 throw 하지 않는다. 비즈니스 경로 보호', async () => {
    const failing = new FakeLogServerClient();
    failing.post = async () => {
      throw new Error('log-server down');
    };
    const { port, producer, moduleRef } = await setup(failing);

    expect(() => port.log(ENTRY)).not.toThrow();
    await expect(producer['producer'].flush()).resolves.toBeUndefined();
    await moduleRef.close();
  });
});

describe('safeActivityLog', () => {
  /**
   * 여기가 "throw 금지" 를 보장하는 지점이다. 도메인 서비스 15곳에 try/catch 를 흩뿌리는 대신
   * 주입 경계에서 한 번 감싸므로, 이 스펙이 그 보장을 대표해 잠근다.
   */
  it('감싼 어댑터가 throw 해도 호출부로 새지 않는다', () => {
    const exploding: ActivityLogPort = {
      log: () => {
        throw new Error('매핑 폭발');
      },
    };
    const safe = safeActivityLog(exploding, { error: () => undefined } as never);
    expect(() => safe.log(ENTRY)).not.toThrow();
  });

  it('정상 어댑터는 그대로 통과시킨다', () => {
    const calls: unknown[] = [];
    const safe = safeActivityLog({ log: (e) => calls.push(e) });
    safe.log(ENTRY);
    expect(calls).toEqual([ENTRY]);
  });

  it('모듈이 주입하는 포트는 감싸진 것이다. 어댑터를 직접 노출하지 않는다', async () => {
    const failing = new FakeLogServerClient();
    const { port, moduleRef } = await setup(failing);
    // 프로듀서까지 진짜인 경로에서도 throw 가 새지 않아야 한다.
    expect(() => port.log({ ...ENTRY, organizationId: 0 })).not.toThrow();
    await moduleRef.close();
  });
});
