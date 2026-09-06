import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SagaRecoveryService } from '@csc/saga';

/** 복구 틱 간격(ms). 중단 판정 유예(5분)보다 짧게 두어, 죽은 사가가 오래 방치되지 않게 한다. */
export const SAGA_RECOVERY_INTERVAL_MS = 60 * 1000;

/**
 * 사가 복구 스케줄러: 주기적으로 중단된 인스턴스를 이어 간다.
 *
 * 읽기 경로에 얹지 않고 스케줄러로 두는 이유: 소유자가 그 화면을 다시 열지 않으면 영원히 복구되지
 * 않는 사가가 생긴다. 크래시는 사용자의 행동과 무관하므로 복구도 그래야 한다.
 *
 * 인스턴스가 여러 개면 여러 러너가 동시에 돈다. 그것은 안전하다: 저장소가 조회와 claim 을 한 문장으로
 * 해 같은 사가를 두 러너가 집을 일이 드물고, 무엇보다 단계가 재실행에 안전해야 한다는 계약이 있다.
 *
 * 이 클래스는 트리거만 맡는다. 무엇을 어떻게 이어 갈지는 `SagaRecoveryService`(코어)에 있다. 그래야 그
 * 로직이 스케줄러 없이(단위 테스트, 운영 수동 호출) 그대로 검증되고 호출된다.
 *
 * 앱은 `ScheduleModule.forRoot()` 를 루트에 등록해야 한다(@nestjs/schedule 규약)
 */
@Injectable()
export class SagaRecoveryScheduler {
  constructor(private readonly recovery: SagaRecoveryService) {}

  @Interval(SAGA_RECOVERY_INTERVAL_MS)
  async handleInterval(): Promise<void> {
    await this.recovery.tick();
  }
}
