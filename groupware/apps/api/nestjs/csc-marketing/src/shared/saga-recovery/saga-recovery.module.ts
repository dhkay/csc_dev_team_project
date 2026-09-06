import { Module } from '@nestjs/common';
import { SagaRecoveryModule } from '@csc/saga/nest';
import { SavedPlanModule } from '../../domains/saved-plan/saved-plan.module';
import { SavePlanSaga } from '../../domains/saved-plan/core/application/sagas';
import { VideoProjectModule } from '../../domains/video-project/video-project.module';
import {
  CreateVideoProjectSaga,
  RerenderVideoProjectSaga,
  RerenderVideoProjectSegmentSaga,
} from '../../domains/video-project/core/application/sagas';
import { VideoFinalModule } from '../../domains/video-final/video-final.module';
import {
  CreateVideoFinalSaga,
  RerenderVideoFinalSaga,
} from '../../domains/video-final/core/application/sagas';
import { MarketingSagaModule } from '../saga.module';
import { SagaRecoveryController } from './saga-recovery.controller';

/**
 * 이 앱의 사가 복구 배선: 정의 목록 + 운영 엔드포인트
 * 새 사가는 아래 definitions 에 한 줄. 누락 시 중단된 사가를 아무도 이어 가지 않아
 * 소스 검사(__tests__/saga-registry.spec.ts)가 함께 지킨다.
 */
@Module({
  imports: [
    SagaRecoveryModule.forRoot({
      imports: [MarketingSagaModule, SavedPlanModule, VideoProjectModule, VideoFinalModule],
      definitions: [
        SavePlanSaga,
        CreateVideoProjectSaga,
        RerenderVideoProjectSaga,
        RerenderVideoProjectSegmentSaga,
        CreateVideoFinalSaga,
        RerenderVideoFinalSaga,
      ],
    }),
  ],
  controllers: [SagaRecoveryController],
})
export class MarketingSagaRecoveryModule {}