import type { FormulaReviewSummary } from '../../../domain/types';

/** 02_화면구성.md 사용자 권한표의 REVIEWER 워크플로우(검수 요청/배정/승인·수정요청·반려)가 호출하는 진입점. */
export interface RbfrFormulaReviewPort {
  /** 처방 상태가 DRAFT/CALC일 때만 요청할 수 있다. */
  requestReview(formulaId: number, requestedBy: number): Promise<FormulaReviewSummary>;
  listReviewsByFormula(formulaId: number): Promise<FormulaReviewSummary[]>;
  listPendingReviews(): Promise<FormulaReviewSummary[]>;
  /** REVIEWER 화면의 "내가 배정받은 검수" 목록(reviewerId 기준, 아직 결정하지 않은 것만). */
  listMyAssignedReviews(reviewerId: number): Promise<FormulaReviewSummary[]>;
  /** PENDING 상태의 요청만 배정할 수 있고, 처방 소유자 본인은 배정받을 수 없다. */
  pickupReview(reviewId: number, reviewerId: number): Promise<FormulaReviewSummary>;
  /**
   * REVIEWING 상태로 배정된 요청만 결정할 수 있다. APPROVED는 버전 스냅샷을 만든 뒤 처방을
   * FIXED로 바꾸고(profileCode 필수, 승인된 Cell 규칙 판이 없으면 거부), 그 외는 DRAFT로 되돌린다.
   */
  decideReview(
    reviewId: number,
    decision: 'APPROVED' | 'CHANGES' | 'REJECTED',
    comment?: string,
    profileCode?: string,
  ): Promise<FormulaReviewSummary>;
}

export const RBFR_FORMULA_REVIEW_PORT = Symbol('RBFR_FORMULA_REVIEW_PORT');
