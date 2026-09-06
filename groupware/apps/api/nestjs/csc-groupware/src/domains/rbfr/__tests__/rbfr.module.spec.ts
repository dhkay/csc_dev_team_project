import { Test } from '@nestjs/testing';
import { RbfrModule } from '../rbfr.module';
import { RBFR_FORMULA_CALCULATION_PORT } from '../core/application/ports/inbound/rbfr-formula-calculation.port';
import { RBFR_INGREDIENT_REGISTRATION_PORT } from '../core/application/ports/inbound/rbfr-ingredient-registration.port';
import { RBFR_FORMULA_REGISTRATION_PORT } from '../core/application/ports/inbound/rbfr-formula-registration.port';
import { RBFR_MFDS_SYNC_PORT } from '../core/application/ports/inbound/rbfr-mfds-sync.port';
import { RBFR_RECOMMENDATION_PORT } from '../core/application/ports/inbound/rbfr-recommendation.port';
import { RBFR_SETTINGS_PORT } from '../core/application/ports/inbound/rbfr-settings.port';
import {
  RbfrFormulaController,
  RbfrIngredientController,
  RbfrMfdsController,
  RbfrRecommendationController,
  RbfrSettingsController,
} from '../adapters/inbound/http/controllers';

describe('RbfrModule', () => {
  it('DI 그래프가 실제로 조립된다(Controller/Port 인스턴스 확인)', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [RbfrModule] }).compile();

    expect(moduleRef.get(RbfrFormulaController)).toBeInstanceOf(RbfrFormulaController);
    expect(moduleRef.get(RbfrIngredientController)).toBeInstanceOf(RbfrIngredientController);
    expect(moduleRef.get(RbfrMfdsController)).toBeInstanceOf(RbfrMfdsController);
    expect(moduleRef.get(RbfrRecommendationController)).toBeInstanceOf(RbfrRecommendationController);
    expect(moduleRef.get(RbfrSettingsController)).toBeInstanceOf(RbfrSettingsController);
    expect(moduleRef.get(RBFR_FORMULA_CALCULATION_PORT)).toBeDefined();
    expect(moduleRef.get(RBFR_INGREDIENT_REGISTRATION_PORT)).toBeDefined();
    expect(moduleRef.get(RBFR_FORMULA_REGISTRATION_PORT)).toBeDefined();
    expect(moduleRef.get(RBFR_MFDS_SYNC_PORT)).toBeDefined();
    expect(moduleRef.get(RBFR_RECOMMENDATION_PORT)).toBeDefined();
    expect(moduleRef.get(RBFR_SETTINGS_PORT)).toBeDefined();

    await moduleRef.close();
  });
});
