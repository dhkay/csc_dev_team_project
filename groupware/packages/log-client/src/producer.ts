/**
 * 버퍼드 로그 프로듀서: 프레임워크 비종속
 *
 * 이 파일의 단 하나의 계약: 로깅이 비즈니스 경로를 절대 막지 않는다. 느려지게도, 실패하게도,
 * 예외를 던지게도 하지 않는다. 로그 서버가 죽어 있어도 기획서 생성은 성공해야 한다.
 * 그 계약을 지키기 위한 구체적 선택들이 아래에 있고, 각각 왜인지 적어 둔다.
 *
 * 전송은 주입받는다(`transport`): 이 패키지가 HTTP 클라이언트를 고르지 않는다. NestJS 앱은
 * 자기 `NestServiceClient` 를, 다른 런타임은 자기 것을 꽂는다.
 */

import {
  InvalidEnvelopeError,
  toWire,
  type LogEnvelopeWire,
  type LogInput,
} from '@csc/log-contracts';

/** log-server `POST /logs` 의 응답: 부분 성공 영수증(조용한 유실 금지) */
export interface LogIngestReceipt {
  accepted: number;
  rejected: number;
  errors: { reason: string; detail: string }[];
}

/** 배치 전송. 실패는 예외로 알린다(HTTP 상태를 담은 에러면 4xx/5xx 분기가 정확해진다) */
export type LogTransport = (records: LogEnvelopeWire[]) => Promise<LogIngestReceipt>;

export interface LogProducerLogger {
  warn(message: string): void;
  error(message: string): void;
}

export interface LogProducerOptions {
  transport: LogTransport;
  // 엔벨로프 environment 기본값(dev/staging/prod)
  environment: string;
  // 한 번에 보낼 최대 레코드 수. log-server 상한(500)보다 넉넉히 작게 잡는다.
  maxBatchSize?: number;
  // 주기 플러시 간격(ms). 배치가 안 차도 이 주기로 비운다.
  flushIntervalMs?: number;
  // 버퍼 상한. 넘으면 가장 오래된 것부터 버린다.
  maxBufferSize?: number;
  // 종료 시 드레인 마감(ms). 로그 때문에 배포가 지연되면 안 된다.
  drainTimeoutMs?: number;
  logger?: LogProducerLogger;
}

export interface LogProducerStats {
  buffered: number;
  sent: number;
  droppedOverflow: number;
  droppedInvalid: number;
  droppedTransport: number;
}

const DEFAULT_MAX_BATCH = 100;
const DEFAULT_FLUSH_MS = 2_000;
const DEFAULT_MAX_BUFFER = 5_000;
const DEFAULT_DRAIN_MS = 3_000;
/** 같은 종류의 실패를 매번 찍으면 로그 서버 장애가 우리 로그 폭주가 된다. */
const LOG_THROTTLE_MS = 60_000;

/** 전송 에러에서 HTTP 상태를 뽑는다. 없으면 null(네트워크/알 수 없는 실패로 취급) */
function statusOf(error: unknown): number | null {
  const raw = (error as { statusCode?: unknown; status?: unknown } | null)?.statusCode ??
    (error as { status?: unknown } | null)?.status;
  return typeof raw === 'number' ? raw : null;
}

export class LogProducer {
  private readonly buffer: LogEnvelopeWire[] = [];
  private readonly options: Required<Omit<LogProducerOptions, 'logger'>> &
    Pick<LogProducerOptions, 'logger'>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private stopped = false;
  private readonly lastLoggedAt = new Map<string, number>();
  private readonly counters: Omit<LogProducerStats, 'buffered'> = {
    sent: 0,
    droppedOverflow: 0,
    droppedInvalid: 0,
    droppedTransport: 0,
  };

  constructor(options: LogProducerOptions) {
    this.options = {
      maxBatchSize: DEFAULT_MAX_BATCH,
      flushIntervalMs: DEFAULT_FLUSH_MS,
      maxBufferSize: DEFAULT_MAX_BUFFER,
      drainTimeoutMs: DEFAULT_DRAIN_MS,
      ...options,
    };
  }

  /**
   * 레코드 1건 적재
   *
   * 동기 + void + 절대 throw 하지 않는다. Promise 를 돌려주지 않는 것이 계약이다.
   * 호출부가 물리적으로 `await` 할 수 없어야 비즈니스 경로가 로깅을 기다릴 수 없다.
   *
   * 여기서 `toWire` 를 동기로 호출하는 것이 핵심이다: trace_id/request_id/occurred_at 이
   * 이 순간의 요청 컨텍스트에서 굳는다. 플러시 시점에 컨텍스트를 읽으면 배치를 밀어낸 아무
   * 요청의 trace 가 붙어 완전히 무관한 값이 된다(log-server 도 같은 이유로 수집 시점에
   * trace 를 채우지 않는다)
   */
  enqueue(input: LogInput): void {
    if (this.stopped) return;
    let record: LogEnvelopeWire;
    try {
      record = toWire(input, { environment: this.options.environment });
    } catch (error) {
      // 불변식 위반은 프로그래머 오류다. 그래도 던지지 않는다. 잘못된 로그가 기획서 생성을
      // 깨뜨리는 것이 최악이다. 대신 카운터 + 에러 로그로 반드시 드러낸다.
      this.counters.droppedInvalid += 1;
      const detail = error instanceof InvalidEnvelopeError ? error.message : String(error);
      this.report('error', `엔벨로프 불변식 위반으로 로그를 버렸습니다(action=${input.action}): ${detail}`);
      return;
    }

    this.buffer.push(record);
    if (this.buffer.length > this.options.maxBufferSize) {
      // 오래된 것부터 버린다: 전송이 죽어 있는 동안엔 최신 활동이 조사에 더 쓸모 있고,
      // 앞쪽은 이미 여러 번 실패한 배치일 가능성이 높다.
      const overflow = this.buffer.length - this.options.maxBufferSize;
      this.buffer.splice(0, overflow);
      this.counters.droppedOverflow += overflow;
      this.report('warn', `버퍼 상한 초과로 오래된 로그 ${overflow}건을 버렸습니다.`);
    }

    this.ensureTimer();
    if (this.buffer.length >= this.options.maxBatchSize) {
      // 크기 트리거: await 하지 않는다(호출부는 이미 반환된 뒤여야 한다)
      queueMicrotask(() => void this.flush());
    }
  }

  /** 버퍼를 비운다. 단일 진행(동시 호출은 하나만 실제로 돈다). 실패는 삼킨다. */
  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.buffer.length > 0) {
        const batch = this.buffer.splice(0, this.options.maxBatchSize);
        const requeued = await this.send(batch);
        // 재큐잉했으면 이 주기는 그만둔다. 같은 배치로 즉시 재시도하면 바쁜 루프가 된다.
        if (requeued) return;
      }
    } finally {
      this.flushing = false;
    }
  }

  /** 배치 1개 전송. 반환값 true = 버퍼 앞쪽으로 되돌렸음(재시도 대상) */
  private async send(batch: LogEnvelopeWire[]): Promise<boolean> {
    try {
      const receipt = await this.options.transport(batch);
      this.counters.sent += receipt?.accepted ?? batch.length;
      if (receipt && receipt.rejected > 0) {
        // 202 라도 일부가 거부될 수 있다. 서버가 영수증을 주는 이유가 이것이라 반드시 읽는다.
        const first = receipt.errors?.[0];
        this.report(
          'warn',
          `로그 ${receipt.rejected}건이 서버에서 거부됐습니다: ${first?.reason ?? 'unknown'} ${first?.detail ?? ''}`,
        );
      }
      return false;
    } catch (error) {
      const status = statusOf(error);
      const retryable = status === null || status >= 500 || status === 429;
      if (retryable) {
        // 5xx/429/네트워크 = 서버 문제. 앞쪽에 되돌려 순서를 지키고 다음 주기에 재시도한다.
        this.buffer.unshift(...batch);
        this.report('warn', `로그 전송 실패(status=${status ?? 'network'}), ${batch.length}건 재시도 대기.`);
        return true;
      }
      // 4xx = 계약 위반/인증 실패 = 우리 잘못. 되돌리면 오염된 배치가 버퍼를 영구히 막는다.
      this.counters.droppedTransport += batch.length;
      this.report(
        'error',
        `로그 전송이 ${status} 로 거부돼 ${batch.length}건을 버렸습니다(action=${batch[0]?.action}).`,
      );
      return false;
    }
  }

  /** 타이머 해제 + 마감까지 드레인. 이후 enqueue 는 무시된다. */
  async shutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // 마감을 두는 이유: 로그 서버가 응답하지 않을 때 SIGTERM 이후 무한정 붙잡으면
    // 오케스트레이터가 강제 종료해 오히려 더 잃는다.
    await Promise.race([
      this.flush(),
      new Promise<void>((resolve) => setTimeout(resolve, this.options.drainTimeoutMs).unref?.()),
    ]);
    if (this.buffer.length > 0) {
      this.report('warn', `종료 드레인 마감으로 로그 ${this.buffer.length}건이 남았습니다.`);
    }
  }

  /** 관측용 카운터. 유실이 조용히 일어나지 않는다는 것을 밖에서 확인할 수 있어야 한다. */
  stats(): LogProducerStats {
    return { buffered: this.buffer.length, ...this.counters };
  }

  private ensureTimer(): void {
    if (this.timer || this.stopped) return;
    this.timer = setInterval(() => void this.flush(), this.options.flushIntervalMs);
    // unref 없으면 이 인터벌이 이벤트 루프를 붙잡아 graceful shutdown 과 테스트 러너가 끝나지 않는다.
    this.timer.unref?.();
  }

  /** 같은 키의 메시지는 LOG_THROTTLE_MS 에 한 번만. 장애 시 로그 폭주를 막는다. */
  private report(level: 'warn' | 'error', message: string): void {
    const logger = this.options.logger;
    if (!logger) return;
    const now = Date.now();
    const last = this.lastLoggedAt.get(level) ?? 0;
    if (now - last < LOG_THROTTLE_MS) return;
    this.lastLoggedAt.set(level, now);
    logger[level](message);
  }
}
