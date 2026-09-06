import { Logger, Module, type DynamicModule, type Provider } from '@nestjs/common';
import { SagaRunner, SagaStorePort, SAGA_STORE_PORT } from '@csc/saga';
import { NEST_SAGA_LOGGER } from './saga-logger.provider';

/** `SagaModule.forRoot` 입력. 저장소 구현만 앱이 정한다. */
export interface SagaModuleOptions {
  // `SagaStorePort` 구현 프로바이더. 앱이 자기 DB 로 만든다(`@csc/saga/drizzle` 의 팩토리 또는 직접)
  //
  // 사가 표는 그 앱의 DB 에 있어야 한다. 다른 앱의 DB 를 보게 만들면 DB 소유권 경계가 깨지고,
  // 두 앱이 한 표의 실행권을 다투게 된다(각자 다른 정의를 들고 있으므로 이어 갈 수도 없다)
  store: Provider;
}

/**
 * 사가 엔진 배선(NestJS)
 *
 * 도메인을 모른다. 어떤 사가가 있는지도 단계가 무엇을 하는지도 여기에 없다. 그래서 새 다단계
 * 쓰기가 늘어도 이 모듈은 그대로다.
 *
 * 배선 방향은 도메인 모듈 → 이 모듈이다. 정의를 모으는 쪽(`SagaRecoveryModule`)이 도메인 모듈들을
 * import 한다. 이 모듈이 정의를 알면 방향이 뒤집혀 순환이 된다.
 */
@Module({})
export class SagaModule {
  static forRoot(options: SagaModuleOptions): DynamicModule {
    return {
      module: SagaModule,
      providers: [
        options.store,
        {
          provide: NEST_SAGA_LOGGER,
          useFactory: () => {
            const logger = new Logger('Saga');
            return { log: (m: string) => logger.log(m), warn: (m: string) => logger.warn(m) };
          },
        },
        {
          // 코어 러너는 데코레이터가 없는 순수 클래스다(프레임워크 비종속). 그래서 여기서 조립한다.
          provide: SagaRunner,
          useFactory: (store: SagaStorePort, logger) => new SagaRunner(store, logger),
          inject: [SAGA_STORE_PORT, NEST_SAGA_LOGGER],
        },
      ],
      // 저장소도 내보낸다. 사가를 조율하는 쪽(복구 러너)은 중단된 인스턴스를 직접 집어야 하고,
      //   그 조회를 러너에 통과 메서드로 얹으면 러너가 저장소의 대리인이 될 뿐이다.
      //   단계를 실행하는 쪽(도메인 서비스)은 러너만 쓴다.
      exports: [SagaRunner, SAGA_STORE_PORT, NEST_SAGA_LOGGER],
    };
  }
}
