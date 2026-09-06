import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { SagaRecoveryService } from '@csc/saga';
import { SagaRecoveryController } from '../shared/saga-recovery/saga-recovery.controller';
import {
  SavePlanSaga,
  SAVE_PLAN_SAGA_TYPE,
} from '../domains/saved-plan/core/application/sagas';
import {
  CreateVideoProjectSaga,
  CREATE_VIDEO_PROJECT_SAGA_TYPE,
  RerenderVideoProjectSaga,
  RERENDER_VIDEO_PROJECT_SAGA_TYPE,
  RerenderVideoProjectSegmentSaga,
  RERENDER_VIDEO_PROJECT_SEGMENT_SAGA_TYPE,
} from '../domains/video-project/core/application/sagas';
import {
  CreateVideoFinalSaga,
  CREATE_VIDEO_FINAL_SAGA_TYPE,
  RerenderVideoFinalSaga,
  RERENDER_VIDEO_FINAL_SAGA_TYPE,
} from '../domains/video-final/core/application/sagas';

/**
 * 루트 조립 스모크
 *
 * 타입 검사가 잡지 못하는 결함을 잡는다. 프로바이더 누락, 토큰 불일치, 모듈 순환은 전부 런타임
 * 오류라 빌드가 통과해도 부팅에서 처음 드러난다. 인터페이스에는 런타임 토큰이 없어 주입이
 * 실패하는 부류다. 여기서 조립만 해 보면 배포 전에 드러난다.
 *
 * DB/redis 에 붙지 않는다: Nest 의 조립은 프로바이더 인스턴스화까지이고 Drizzle 클라이언트는 첫 쿼리에
 * 연결한다. 그래서 외부 의존 없이 돈다.
 */
describe('AppModule', () => {
  it('루트 모듈이 조립된다', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(SagaRecoveryService)).toBeDefined();
    // 컨트롤러가 어느 모듈에도 등록되지 않으면 그 엔드포인트는 런타임에 없다. 배선을 옮길 때
    //   컨트롤러가 딸려가지 못해도 식별자 게이트는 소스만 훑어 그것을 보지 못한다.
    expect(moduleRef.get(SagaRecoveryController, { strict: false })).toBeDefined();
    await moduleRef.close();
  });

  it('사가 정의가 모두 복구 대상으로 등록된다', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // 복구 러너가 정의를 못 찾으면 그 종류의 사가는 중단됐을 때 이어지지 않는다(경고만 남고 방치)
    //   정의를 새로 만들고 SagaRecoveryModule 배열에 넣는 것을 잊는 실수를 여기서 잡는다.
    const registered = [
      moduleRef.get<SavePlanSaga>(SavePlanSaga, { strict: false }).type,
      moduleRef.get<CreateVideoProjectSaga>(CreateVideoProjectSaga, { strict: false }).type,
      moduleRef.get<RerenderVideoProjectSaga>(RerenderVideoProjectSaga, { strict: false })
        .type,
      moduleRef.get<RerenderVideoProjectSegmentSaga>(RerenderVideoProjectSegmentSaga, {
        strict: false,
      }).type,
      moduleRef.get<CreateVideoFinalSaga>(CreateVideoFinalSaga, { strict: false }).type,
      moduleRef.get<RerenderVideoFinalSaga>(RerenderVideoFinalSaga, { strict: false }).type,
    ];
    expect(registered).toEqual([
      SAVE_PLAN_SAGA_TYPE,
      CREATE_VIDEO_PROJECT_SAGA_TYPE,
      RERENDER_VIDEO_PROJECT_SAGA_TYPE,
      RERENDER_VIDEO_PROJECT_SEGMENT_SAGA_TYPE,
      CREATE_VIDEO_FINAL_SAGA_TYPE,
      RERENDER_VIDEO_FINAL_SAGA_TYPE,
    ]);

    const recovery = moduleRef.get(SagaRecoveryService);
    for (const type of registered) {
      expect(recovery.knows(type)).toBe(true);
    }
    await moduleRef.close();
  });
});
