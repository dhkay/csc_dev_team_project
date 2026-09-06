import type { FormulaOwnerStatus, FormulaReviewSummary } from '../../../domain/types';

/** 검수 요청/승인 워크플로우 Outbound Port. rbfr_formula_reviews + rbfr_formulas(상태만)를 다룬다. */
export interface RbfrFormulaReviewRepositoryPort {
  findFormulaOwnerStatus(formulaId: number): Promise<FormulaOwnerStatus | undefined>;
  updateFormulaStatus(formulaId: number, status: FormulaOwnerStatus['status']): Promise<void>;

  createReview(formulaId: number, requestedBy: number): Promise<FormulaReviewSummary>;
  findReview(reviewId: number): Promise<FormulaReviewSummary | undefined>;
  listReviewsByFormula(formulaId: number): Promise<FormulaReviewSummary[]>;
  /** REVIEWER 화면의 대기열: status=PENDING인 검수 요청 전체. */
  listPendingReviews(): Promise<FormulaReviewSummary[]>;
  /** REVIEWER 화면의 "내가 배정받은 검수": reviewerId가 본인이고 status=REVIEWING인 것. */
  listReviewsByReviewer(reviewerId: number): Promise<FormulaReviewSummary[]>;
  updateReviewStatus(
    reviewId: number,
    patch: {
      status: FormulaReviewSummary['status'];
      reviewerId?: number;
      comment?: string;
      decidedAt?: string;
    },
  ): Promise<FormulaReviewSummary>;
}

export const RBFR_FORMULA_REVIEW_REPOSITORY_PORT = Symbol('RBFR_FORMULA_REVIEW_REPOSITORY_PORT');
