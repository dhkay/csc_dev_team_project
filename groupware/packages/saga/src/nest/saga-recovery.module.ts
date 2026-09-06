import {
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type Type,
} from '@nestjs/common';
import {
  SagaDefinition,
  SagaLogger,
  SagaRecoveryService,
  SagaRunner,
  SagaStorePort,
  SAGA_DEFINITIONS,
  SAGA_STORE_PORT,
} from '@csc/saga';
import { NEST_SAGA_LOGGER } from './saga-logger.provider';
import { SagaRecoveryScheduler } from './saga-recovery.scheduler';

/** `SagaRecoveryModule.forRoot` 입력 */
export interface SagaRecoveryModuleOptions {
  // 정의를 내보내는 도메인 모듈들. 여기 없으면 아래 `definitions` 를 주입할 수 없다.
  //
  // 배선 방향이 이 옵션의 존재 이유다. 엔진은 도메인을 몰라야 하고 도메인은 러너를 쓴다. 그래서 정의를
  // 모으는 일은 두 방향 밖의 세 번째 모듈(이 모듈)이 맡는다.
  imports: ModuleMetadata['imports'];
  // 사가 정의 클래스들. 새 사가를 추가하면 여기 한 줄
  //
  // 빠뜨리면 그 사가는 중단됐을 때 이어지지 않는다(복구가 정의를 못 찾아 건너뛰고 경고를 남긴다)
  // 그 실수는 런타임으로 잡히지 않으므로 앱에 소스 검사 테스트를 두는 것을 권한다.
  // (csc-marketing 의 `saga-registry.spec.ts` 가 참고 구현이다)
  definitions: Type<SagaDefinition<object>>[];
  // 주기 실행을 끌 수 있다(기본 켜짐). 끄면 운영 엔드포인트로만 복구한다.
  schedule?: boolean;
}

/**
 * 사가 복구 배선(NestJS): 정의를 모아 복구 러너에 넘긴다.
 *
 * ```ts
 * SagaRecoveryModule.forRoot({
 *   imports: [SavedPlanModule, VideoProjectModule],
 *   definitions: [SavePlanSaga, CreateVideoProjectSaga],
 * })
 * ```
 *
 * HTTP 표면(운영 엔드포인트)은 앱이 갖는다. 이 패키지가 컨트롤러를 들고 있으면 안정 식별자
 * (`[PREFIX-NNN]`)가 두 서버에서 같은 값으로 중복되고, 그 검사(`scripts/check-endpoint-ids.mjs`)는
 * `apps/api` 만 훑기 때문에 중복을 보지도 못한다. 엔드포인트는 그 서버의 문서에 속한다.
 */
@Module({})
export class SagaRecoveryModule {
  static forRoot(options: SagaRecoveryModuleOptions): DynamicModule {
    const { imports, definitions, schedule = true } = options;
    return {
      module: SagaRecoveryModule,
      imports,
      providers: [
        {
          provide: SAGA_DEFINITIONS,
          useFactory: (...instances: SagaDefinition<object>[]) => instances,
          inject: definitions,
        },
        {
          provide: SagaRecoveryService,
          useFactory: (
            store: SagaStorePort,
            runner: SagaRunner,
            defs: readonly SagaDefinition<object>[],
            logger: SagaLogger,
          ) => new SagaRecoveryService(store, runner, defs, logger),
          inject: [SAGA_STORE_PORT, SagaRunner, SAGA_DEFINITIONS, NEST_SAGA_LOGGER],
        },
        ...(schedule ? [SagaRecoveryScheduler] : []),
      ],
      exports: [SagaRecoveryService],
    };
  }
}
