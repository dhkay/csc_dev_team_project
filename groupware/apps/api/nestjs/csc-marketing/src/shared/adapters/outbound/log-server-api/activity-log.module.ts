import { Module } from '@nestjs/common';
import { ACTIVITY_LOG_PORT } from '../../../domain/activity-log';
import { MarketingServiceTokenService } from '../service-token';
import { ActivityLogAdapter } from './activity-log.adapter';
import { LogServerApiClientService } from './log-server-api-client.service';
import { MarketingLogProducerService } from './marketing-log-producer.service';
import { safeActivityLog } from './safe-activity-log';

/**
 * 활동 로그 배선: 프로듀서 싱글톤 하나를 여러 도메인이 공유하게 만드는 모듈
 * `@Global()` 미사용 이유: 도메인이 imports 로 명시하면 활동 기록 사실이 모듈 선언에 드러남
 */
@Module({
  providers: [
    MarketingServiceTokenService,
    LogServerApiClientService,
    MarketingLogProducerService,
    ActivityLogAdapter,
    {
      // safeActivityLog 로 감싸 주입: "throw 금지"를 구현의 약속이 아니라 구조로 만듦
      provide: ACTIVITY_LOG_PORT,
      useFactory: (adapter: ActivityLogAdapter) => safeActivityLog(adapter),
      inject: [ActivityLogAdapter],
    },
  ],
  exports: [ACTIVITY_LOG_PORT],
})
export class ActivityLogModule {}
