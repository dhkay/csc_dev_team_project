/**
 * NestJS 바인딩: 라이프사이클만 붙인다.
 *
 * `NestServiceClient` 와 같은 모양: 서브클래스가 설정을 주입하고 베이스가 공통 동작을 갖는다.
 * 여기서 하는 일은 단 하나, 종료 시 버퍼 드레인이다.
 *
 * 주의: 이게 실제로 불리려면 앱 부트스트랩에 `app.enableShutdownHooks()` 가 있어야 한다.
 * 없으면 SIGTERM 에 onApplicationShutdown 이 돌지 않아 배포마다 마지막 버퍼가 유실된다.
 */

import type { OnApplicationShutdown } from '@nestjs/common';
import { LogProducer, type LogProducerOptions, type LogProducerStats } from '../producer';
import type { LogInput } from '@csc/log-contracts';

export abstract class NestLogProducer implements OnApplicationShutdown {
  protected readonly producer: LogProducer;

  constructor(options: LogProducerOptions) {
    this.producer = new LogProducer(options);
  }

  /** 동기 void: 코어의 계약을 그대로 노출한다(호출부가 await 할 수 없어야 한다) */
  enqueue(input: LogInput): void {
    this.producer.enqueue(input);
  }

  stats(): LogProducerStats {
    return this.producer.stats();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.producer.shutdown();
  }
}
