import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  RBFR_FORMULA_REVIEW_PORT,
  RBFR_FORMULA_VERSION_PORT,
  type RbfrFormulaReviewPort,
  type RbfrFormulaVersionPort,
} from '../../../../core/application/ports/inbound';
import { DecideReviewDto, PickupReviewDto, RequestReviewDto } from '../dto';

/**
 * 02_화면구성.md 사용자 권한표의 REVIEWER 워크플로우(검수 요청/배정/승인·수정요청·반려)와
 * 확정 버전 이력 조회가 호출하는 진입점.
 */
@Controller('rbfr-api')
export class RbfrReviewController {
  constructor(
    @Inject(RBFR_FORMULA_REVIEW_PORT)
    private readonly review: RbfrFormulaReviewPort,
    @Inject(RBFR_FORMULA_VERSION_PORT)
    private readonly formulaVersion: RbfrFormulaVersionPort,
  ) {}

  @Post('formulas/:formulaId/reviews')
  async requestReview(@Param('formulaId', ParseIntPipe) formulaId: number, @Body() dto: RequestReviewDto) {
    return await this.review.requestReview(formulaId, dto.requestedBy);
  }

  @Get('formulas/:formulaId/reviews')
  async listReviewsByFormula(@Param('formulaId', ParseIntPipe) formulaId: number) {
    return await this.review.listReviewsByFormula(formulaId);
  }

  @Get('reviews/pending')
  async listPendingReviews() {
    return await this.review.listPendingReviews();
  }

  @Get('reviews/mine')
  async listMyAssignedReviews(@Query('reviewerId', ParseIntPipe) reviewerId: number) {
    return await this.review.listMyAssignedReviews(reviewerId);
  }

  @Post('reviews/:reviewId/pickup')
  async pickupReview(@Param('reviewId', ParseIntPipe) reviewId: number, @Body() dto: PickupReviewDto) {
    return await this.review.pickupReview(reviewId, dto.reviewerId);
  }

  @Post('reviews/:reviewId/decide')
  async decideReview(@Param('reviewId', ParseIntPipe) reviewId: number, @Body() dto: DecideReviewDto) {
    return await this.review.decideReview(reviewId, dto.decision, dto.comment, dto.profileCode);
  }

  @Get('formulas/:formulaId/versions')
  async listVersions(@Param('formulaId', ParseIntPipe) formulaId: number) {
    return await this.formulaVersion.listVersions(formulaId);
  }
}
