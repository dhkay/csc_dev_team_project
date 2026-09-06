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
  RbfrIngredientDetailService,
  RbfrFormulaSensoryStabilityService,
  RbfrFormulaReviewService,
  RbfrFormulaVersionService,
} from './core/application/services';
import { RBFR_SCORING_PORT } from './core/application/ports/inbound/rbfr-scoring.port';
import { RBFR_VALIDATION_PORT } from './core/application/ports/inbound/rbfr-validation.port';
import { RBFR_FORMULA_CALCULATION_PORT } from './core/application/ports/inbound/rbfr-formula-calculation.port';
import { RBFR_INGREDIENT_REGISTRATION_PORT } from './core/application/ports/inbound/rbfr-ingredient-registration.port';
import { RBFR_FORMULA_REGISTRATION_PORT } from './core/application/ports/inbound/rbfr-formula-registration.port';
import { RBFR_MFDS_SYNC_PORT } from './core/application/ports/inbound/rbfr-mfds-sync.port';
import { RBFR_RECOMMENDATION_PORT } from './core/application/ports/inbound/rbfr-recommendation.port';
import { RBFR_SETTINGS_PORT } from './core/application/ports/inbound/rbfr-settings.port';
import { RBFR_INGREDIENT_DETAIL_PORT } from './core/application/ports/inbound/rbfr-ingredient-detail.port';
import { RBFR_FORMULA_SENSORY_STABILITY_PORT } from './core/application/ports/inbound/rbfr-formula-sensory-stability.port';
import { RBFR_FORMULA_REVIEW_PORT } from './core/application/ports/inbound/rbfr-formula-review.port';
import { RBFR_FORMULA_VERSION_PORT } from './core/application/ports/inbound/rbfr-formula-version.port';
import {
  RBFR_FORMULA_REPOSITORY_PORT,
  RBFR_INGREDIENT_REPOSITORY_PORT,
  RBFR_FORMULA_REGISTRATION_REPOSITORY_PORT,
  RBFR_MFDS_API_PORT,
  RBFR_SETTINGS_REPOSITORY_PORT,
  RBFR_INGREDIENT_DETAIL_REPOSITORY_PORT,
  RBFR_FORMULA_SENSORY_STABILITY_REPOSITORY_PORT,
  RBFR_FORMULA_REVIEW_REPOSITORY_PORT,
  RBFR_FORMULA_VERSION_REPOSITORY_PORT,
} from './core/application/ports/outbound';
import { RbfrFormulaRepositoryAdapter } from './adapters/outbound/db/groupwaredb/rbfr-formula-repository.adapter';
import { RbfrIngredientRepositoryAdapter } from './adapters/outbound/db/groupwaredb/rbfr-ingredient-repository.adapter';
import { RbfrFormulaRegistrationRepositoryAdapter } from './adapters/outbound/db/groupwaredb/rbfr-formula-registration-repository.adapter';
import { RbfrMfdsApiAdapter } from './adapters/outbound/external/rbfr-mfds-api.adapter';
import { RbfrSettingsRepositoryAdapter } from './adapters/outbound/db/groupwaredb/rbfr-settings-repository.adapter';
import { RbfrIngredientDetailRepositoryAdapter } from './adapters/outbound/db/groupwaredb/rbfr-ingredient-detail-repository.adapter';
import { RbfrFormulaSensoryStabilityRepositoryAdapter } from './adapters/outbound/db/groupwaredb/rbfr-formula-sensory-stability-repository.adapter';
import { RbfrFormulaReviewRepositoryAdapter } from './adapters/outbound/db/groupwaredb/rbfr-formula-review-repository.adapter';
import { RbfrFormulaVersionRepositoryAdapter } from './adapters/outbound/db/groupwaredb/rbfr-formula-version-repository.adapter';
import {
  RbfrFormulaController,
  RbfrIngredientController,
  RbfrMfdsController,
  RbfrRecommendationController,
  RbfrSettingsController,
  RbfrIngredientDetailController,
  RbfrReviewController,
} from './adapters/inbound/http/controllers';

/**
 * RBFR(역할 기반 배합 비율) 도메인 모듈. Controller 7개: 계산·검증·생성·사용감안정성기록
 * (`RbfrFormulaController`), 원료 등록·조회(`RbfrIngredientController`), 식약처 성분사전
 * 연동(`RbfrMfdsController`), 역방향 추천(`RbfrRecommendationController`), 설정/Profile
 * 관리(`RbfrSettingsController`), 원료 등록 부속 섹션(CAS/규제/인증/무첨가/원료쌍,
 * `RbfrIngredientDetailController`), 검수 워크플로우(`RbfrReviewController`).
 */
@Module({
  imports: [ConfigModule],
  controllers: [
    RbfrFormulaController,
    RbfrIngredientController,
    RbfrMfdsController,
    RbfrRecommendationController,
    RbfrSettingsController,
    RbfrIngredientDetailController,
    RbfrReviewController,
  ],
  providers: [
    { provide: RBFR_SCORING_PORT, useClass: RbfrScoringService },
    { provide: RBFR_VALIDATION_PORT, useClass: RbfrValidationService },
    { provide: RBFR_FORMULA_REPOSITORY_PORT, useClass: RbfrFormulaRepositoryAdapter },
    { provide: RBFR_INGREDIENT_REPOSITORY_PORT, useClass: RbfrIngredientRepositoryAdapter },
    { provide: RBFR_FORMULA_REGISTRATION_REPOSITORY_PORT, useClass: RbfrFormulaRegistrationRepositoryAdapter },
    { provide: RBFR_MFDS_API_PORT, useClass: RbfrMfdsApiAdapter },
    { provide: RBFR_SETTINGS_REPOSITORY_PORT, useClass: RbfrSettingsRepositoryAdapter },
    { provide: RBFR_INGREDIENT_DETAIL_REPOSITORY_PORT, useClass: RbfrIngredientDetailRepositoryAdapter },
    {
      provide: RBFR_FORMULA_SENSORY_STABILITY_REPOSITORY_PORT,
      useClass: RbfrFormulaSensoryStabilityRepositoryAdapter,
    },
    { provide: RBFR_FORMULA_REVIEW_REPOSITORY_PORT, useClass: RbfrFormulaReviewRepositoryAdapter },
    { provide: RBFR_FORMULA_VERSION_REPOSITORY_PORT, useClass: RbfrFormulaVersionRepositoryAdapter },
    { provide: RBFR_FORMULA_CALCULATION_PORT, useClass: RbfrFormulaCalculationService },
    { provide: RBFR_INGREDIENT_REGISTRATION_PORT, useClass: RbfrIngredientRegistrationService },
    { provide: RBFR_FORMULA_REGISTRATION_PORT, useClass: RbfrFormulaRegistrationService },
    { provide: RBFR_MFDS_SYNC_PORT, useClass: RbfrMfdsSyncService },
    { provide: RBFR_RECOMMENDATION_PORT, useClass: RbfrRecommendationService },
    { provide: RBFR_SETTINGS_PORT, useClass: RbfrSettingsService },
    { provide: RBFR_INGREDIENT_DETAIL_PORT, useClass: RbfrIngredientDetailService },
    { provide: RBFR_FORMULA_SENSORY_STABILITY_PORT, useClass: RbfrFormulaSensoryStabilityService },
    { provide: RBFR_FORMULA_REVIEW_PORT, useClass: RbfrFormulaReviewService },
    { provide: RBFR_FORMULA_VERSION_PORT, useClass: RbfrFormulaVersionService },
  ],
  exports: [RBFR_FORMULA_CALCULATION_PORT, RBFR_SCORING_PORT, RBFR_VALIDATION_PORT],
})
export class RbfrModule {}
