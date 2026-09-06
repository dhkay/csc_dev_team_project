import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  RbfrScoringService,
  RbfrValidationService,
  RbfrFormulaCalculationService,
  RbfrIngredientRegistrationService,
  RbfrFormulaRegistrationService,
  RbfrMfdsSyncService,
  RbfrRecommendationService,
  RbfrSettingsService,
} from './core/application/services';
import { RBFR_SCORING_PORT } from './core/application/ports/inbound/rbfr-scoring.port';
import { RBFR_VALIDATION_PORT } from './core/application/ports/inbound/rbfr-validation.port';
import { RBFR_FORMULA_CALCULATION_PORT } from './core/application/ports/inbound/rbfr-formula-calculation.port';
import { RBFR_INGREDIENT_REGISTRATION_PORT } from './core/application/ports/inbound/rbfr-ingredient-registration.port';
import { RBFR_FORMULA_REGISTRATION_PORT } from './core/application/ports/inbound/rbfr-formula-registration.port';
import { RBFR_MFDS_SYNC_PORT } from './core/application/ports/inbound/rbfr-mfds-sync.port';
import { RBFR_RECOMMENDATION_PORT } from './core/application/ports/inbound/rbfr-recommendation.port';
import { RBFR_SETTINGS_PORT } from './core/application/ports/inbound/rbfr-settings.port';
import {
  RBFR_FORMULA_REPOSITORY_PORT,
  RBFR_INGREDIENT_REPOSITORY_PORT,
  RBFR_FORMULA_REGISTRATION_REPOSITORY_PORT,
  RBFR_MFDS_API_PORT,
  RBFR_SETTINGS_REPOSITORY_PORT,
} from './core/application/ports/outbound';
import { RbfrFormulaRepositoryAdapter } from './adapters/outbound/db/groupwaredb/rbfr-formula-repository.adapter';
import { RbfrIngredientRepositoryAdapter } from './adapters/outbound/db/groupwaredb/rbfr-ingredient-repository.adapter';
import { RbfrFormulaRegistrationRepositoryAdapter } from './adapters/outbound/db/groupwaredb/rbfr-formula-registration-repository.adapter';
import { RbfrMfdsApiAdapter } from './adapters/outbound/external/rbfr-mfds-api.adapter';
import { RbfrSettingsRepositoryAdapter } from './adapters/outbound/db/groupwaredb/rbfr-settings-repository.adapter';
import {
  RbfrFormulaController,
  RbfrIngredientController,
  RbfrMfdsController,
  RbfrRecommendationController,
  RbfrSettingsController,
} from './adapters/inbound/http/controllers';

/**
 * RBFR(역할 기반 배합 비율) 도메인 모듈. Controller 5개: 계산·검증·생성(`RbfrFormulaController`),
 * 원료 등록·조회(`RbfrIngredientController`), 식약처 성분사전 연동(`RbfrMfdsController`),
 * 역방향 추천(`RbfrRecommendationController`), 설정/Profile 관리(`RbfrSettingsController`).
 */
@Module({
  imports: [ConfigModule],
  controllers: [
    RbfrFormulaController,
    RbfrIngredientController,
    RbfrMfdsController,
    RbfrRecommendationController,
    RbfrSettingsController,
  ],
  providers: [
    { provide: RBFR_SCORING_PORT, useClass: RbfrScoringService },
    { provide: RBFR_VALIDATION_PORT, useClass: RbfrValidationService },
    { provide: RBFR_FORMULA_REPOSITORY_PORT, useClass: RbfrFormulaRepositoryAdapter },
    { provide: RBFR_INGREDIENT_REPOSITORY_PORT, useClass: RbfrIngredientRepositoryAdapter },
    { provide: RBFR_FORMULA_REGISTRATION_REPOSITORY_PORT, useClass: RbfrFormulaRegistrationRepositoryAdapter },
    { provide: RBFR_MFDS_API_PORT, useClass: RbfrMfdsApiAdapter },
    { provide: RBFR_SETTINGS_REPOSITORY_PORT, useClass: RbfrSettingsRepositoryAdapter },
    { provide: RBFR_FORMULA_CALCULATION_PORT, useClass: RbfrFormulaCalculationService },
    { provide: RBFR_INGREDIENT_REGISTRATION_PORT, useClass: RbfrIngredientRegistrationService },
    { provide: RBFR_FORMULA_REGISTRATION_PORT, useClass: RbfrFormulaRegistrationService },
    { provide: RBFR_MFDS_SYNC_PORT, useClass: RbfrMfdsSyncService },
    { provide: RBFR_RECOMMENDATION_PORT, useClass: RbfrRecommendationService },
    { provide: RBFR_SETTINGS_PORT, useClass: RbfrSettingsService },
  ],
  exports: [RBFR_FORMULA_CALCULATION_PORT, RBFR_SCORING_PORT, RBFR_VALIDATION_PORT],
})
export class RbfrModule {}
