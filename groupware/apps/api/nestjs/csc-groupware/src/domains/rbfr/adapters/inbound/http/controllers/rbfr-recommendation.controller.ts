import { Body, Controller, Inject, Post } from '@nestjs/common';
import { RBFR_RECOMMENDATION_PORT, type RbfrRecommendationPort } from '../../../../core/application/ports/inbound';
import { RecommendIngredientsDto } from '../dto';

/** 02_화면구성.md 탭2 "역방향 추천" 화면이 호출하는 진입점. */
@Controller('rbfr-api')
export class RbfrRecommendationController {
  constructor(
    @Inject(RBFR_RECOMMENDATION_PORT)
    private readonly recommendation: RbfrRecommendationPort,
  ) {}

  @Post('recommendations')
  async recommendIngredients(@Body() dto: RecommendIngredientsDto) {
    return await this.recommendation.recommendIngredients(dto.targetRatios);
  }
}
