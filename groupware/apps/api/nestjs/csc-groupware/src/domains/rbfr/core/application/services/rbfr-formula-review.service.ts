/**
 * 8단계(관리자/검증 워크플로우) — 검수 요청/배정/승인·수정요청·반려. 02_화면구성.md
 * "REVIEWER: 검수 요청 처리(승인·수정요청·반려). 자기 처방은 자기가 못 함"을 이 서비스가
 * 강제한다. 승인(APPROVED)은 RbfrFormulaVersionPort로 버전 스냅샷을 먼저 만든 뒤에만 처방을
 * FIXED로 바꾼다 — 스냅샷 생성이 실패하면(예: 승인된 Cell 규칙 판 없음) 검수/처방 상태 둘 다
 * 그대로 남아 절반만 반영되는 상태를 막는다.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { FormulaReviewSummary } from '../../domain/types';
import { RBFR_FORMULA_VERSION_PORT, type RbfrFormulaReviewPort, type RbfrFormulaVersionPort } from '../ports/inbound';
import { RBFR_FORMULA_REVIEW_REPOSITORY_PORT, type RbfrFormulaReviewRepositoryPort } from '../ports/outbound';

@Injectable()
export class RbfrFormulaReviewService implements RbfrFormulaReviewPort {
  constructor(
    @Inject(RBFR_FORMULA_REVIEW_REPOSITORY_PORT)
    private readonly reviewRepository: RbfrFormulaReviewRepositoryPort,
    @Inject(RBFR_FORMULA_VERSION_PORT)
    private readonly formulaVersion: RbfrFormulaVersionPort,
  ) {}

  async requestReview(formulaId: number, requestedBy: number): Promise<FormulaReviewSummary> {
    const formula = await this.reviewRepository.findFormulaOwnerStatus(formulaId);
    if (!formula) throw new Error(`존재하지 않는 처방입니다: ${formulaId}`);
    if (formula.status !== 'DRAFT' && formula.status !== 'CALC') {
      throw new Error(`검수 요청은 DRAFT/CALC 상태에서만 가능합니다(현재: ${formula.status}).`);
    }

    const review = await this.reviewRepository.createReview(formulaId, requestedBy);
    await this.reviewRepository.updateFormulaStatus(formulaId, 'REVIEW');
    return review;
  }

  async listReviewsByFormula(formulaId: number): Promise<FormulaReviewSummary[]> {
    return await this.reviewRepository.listReviewsByFormula(formulaId);
  }

  async listPendingReviews(): Promise<FormulaReviewSummary[]> {
    return await this.reviewRepository.listPendingReviews();
  }

  async listMyAssignedReviews(reviewerId: number): Promise<FormulaReviewSummary[]> {
    return await this.reviewRepository.listReviewsByReviewer(reviewerId);
  }

  async pickupReview(reviewId: number, reviewerId: number): Promise<FormulaReviewSummary> {
    const review = await this.findReviewOrThrow(reviewId);
    if (review.status !== 'PENDING') {
      throw new Error('대기 중(PENDING)인 검수 요청만 배정할 수 있습니다.');
    }

    const formula = await this.reviewRepository.findFormulaOwnerStatus(review.formulaId);
    if (formula?.ownerId === reviewerId) {
      throw new Error('자기 처방은 자기가 검수할 수 없습니다.');
    }

    return await this.reviewRepository.updateReviewStatus(reviewId, { status: 'REVIEWING', reviewerId });
  }

  async decideReview(
    reviewId: number,
    decision: 'APPROVED' | 'CHANGES' | 'REJECTED',
    comment?: string,
    profileCode?: string,
  ): Promise<FormulaReviewSummary> {
    const review = await this.findReviewOrThrow(reviewId);
    if (review.status !== 'REVIEWING') {
      throw new Error('배정(REVIEWING)된 검수 요청만 승인/수정요청/반려할 수 있습니다.');
    }

    if (decision === 'APPROVED') {
      if (!profileCode) throw new Error('승인하려면 profileCode가 필요합니다.');
      if (review.reviewerId === undefined) throw new Error('배정된 검수자가 없어 확정할 수 없습니다.');
      // 스냅샷 생성이 실패하면 아래 상태 갱신 전에 여기서 그대로 던져진다(부분 반영 방지).
      await this.formulaVersion.confirmFormula(review.formulaId, profileCode, review.reviewerId);
    }

    const updated = await this.reviewRepository.updateReviewStatus(reviewId, {
      status: decision,
      comment,
      decidedAt: new Date().toISOString(),
    });
    // 승인은 처방을 FIXED로, 수정요청/반려는 다시 DRAFT로 되돌린다(재작성 후 재요청).
    await this.reviewRepository.updateFormulaStatus(review.formulaId, decision === 'APPROVED' ? 'FIXED' : 'DRAFT');
    return updated;
  }

  private async findReviewOrThrow(reviewId: number): Promise<FormulaReviewSummary> {
    const review = await this.reviewRepository.findReview(reviewId);
    if (!review) throw new Error(`존재하지 않는 검수 요청입니다: ${reviewId}`);
    return review;
  }
}
