import { Logger } from '@nestjs/common';
import type { ActivityLogEntry, ActivityLogPort } from '../../../domain/activity-log';

/**
 * 활동 로그 포트를 절대 throw 하지 않는 것으로 감싼다.
 * 주입 경계에서 한 번 감싸면 구조적으로 보장되어 도메인 서비스가 방어 코드를 쓰지 않음
 * 삼킨 예외는 남기되 로깅 실패로 로그가 폭주하지 않게 과하게 찍지 않음
 */
export function safeActivityLog(inner: ActivityLogPort, logger?: Logger): ActivityLogPort {
  const log = logger ?? new Logger('ActivityLog');
  return {
    log(entry: ActivityLogEntry): void {
      try {
        inner.log(entry);
      } catch (error) {
        log.error(
          `활동 로그 기록 실패(action=${entry.action}): 비즈니스 경로는 계속됩니다: ${String(error)}`,
        );
      }
    },
  };
}
