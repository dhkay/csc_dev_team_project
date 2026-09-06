import { Module } from '@nestjs/common';
import { marketingDb, marketingSagas } from '@csc/database/marketingdb';
import { SAGA_STORE_PORT } from '@csc/saga';
import { SagaModule } from '@csc/saga/nest';
import { createDrizzleSagaStore } from '@csc/saga/drizzle';

/**
 * 이 앱의 사가 배선: 엔진(@csc/saga)에 우리 DB 를 끼운다.
 *
 * 앱이 갖는 것은 이 세 줄뿐이다. 단계 실행/보상/실행권/복구/정리는 전부 패키지에 있다.
 * 사가 표가 우리 DB 에 있는 이유는 DB 소유권 경계다: 다른 앱의 표를 보면 그 앱의 사가를 이어 가려
 * 하는데 정의를 모르므로 건너뛰기만 반복하고, 실행권도 서로 다투게 된다.
 *
 * `forRoot` 를 한 번만 부르고 그 결과를 다시 내보낸다. 도메인 모듈마다 부르면 러너와 저장소가
 * 모듈마다 따로 생겨(실행권을 공유하지 않는 인스턴스들) 같은 사가를 함께 돌 수 있다.
 */
const sagaEngine = SagaModule.forRoot({
  store: {
    provide: SAGA_STORE_PORT,
    useFactory: () => createDrizzleSagaStore(marketingDb, marketingSagas),
  },
});

@Module({
  imports: [sagaEngine],
  exports: [sagaEngine],
})
export class MarketingSagaModule {}
