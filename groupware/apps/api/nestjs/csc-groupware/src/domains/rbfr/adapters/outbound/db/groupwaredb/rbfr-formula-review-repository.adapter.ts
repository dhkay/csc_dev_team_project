/** RbfrFormulaReviewRepositoryPort의 Drizzle 구현. groupwaredb를 직접 사용한다. */
import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { groupwareDb, rbfrFormulas, rbfrFormulaReviews } from '@csc/database/groupwaredb';
import type { FormulaOwnerStatus, FormulaReviewSummary } from '../../../../core/domain/types';
import type { RbfrFormulaReviewRepositoryPort } from '../../../../core/application/ports/outbound';

@Injectable()
export class RbfrFormulaReviewRepositoryAdapter implements RbfrFormulaReviewRepositoryPort {
  async findFormulaOwnerStatus(formulaId: number): Promise<FormulaOwnerStatus | undefined> {
    const [row] = await groupwareDb
      .select({ ownerId: rbfrFormulas.ownerId, status: rbfrFormulas.status })
      .from(rbfrFormulas)
      .where(eq(rbfrFormulas.id, formulaId));
    return row;
  }

  async updateFormulaStatus(formulaId: number, status: FormulaOwnerStatus['status']): Promise<void> {
    await groupwareDb.update(rbfrFormulas).set({ status, updatedAt: new Date() }).where(eq(rbfrFormulas.id, formulaId));
  }

  async createReview(formulaId: number, requestedBy: number): Promise<FormulaReviewSummary> {
    const [row] = await groupwareDb
      .insert(rbfrFormulaReviews)
      .values({ formulaId, requestedBy })
      .returning();
    return toReviewSummary(row);
  }

  async findReview(reviewId: number): Promise<FormulaReviewSummary | undefined> {
    const [row] = await groupwareDb.select().from(rbfrFormulaReviews).where(eq(rbfrFormulaReviews.id, reviewId));
    return row ? toReviewSummary(row) : undefined;
  }

  async listReviewsByFormula(formulaId: number): Promise<FormulaReviewSummary[]> {
    const rows = await groupwareDb
      .select()
      .from(rbfrFormulaReviews)
      .where(eq(rbfrFormulaReviews.formulaId, formulaId))
      .orderBy(rbfrFormulaReviews.requestedAt);
    return rows.map(toReviewSummary);
  }

  async listPendingReviews(): Promise<FormulaReviewSummary[]> {
    const rows = await groupwareDb
      .select()
      .from(rbfrFormulaReviews)
      .where(eq(rbfrFormulaReviews.status, 'PENDING'))
      .orderBy(rbfrFormulaReviews.requestedAt);
    return rows.map(toReviewSummary);
  }

  async listReviewsByReviewer(reviewerId: number): Promise<FormulaReviewSummary[]> {
    const rows = await groupwareDb
      .select()
      .from(rbfrFormulaReviews)
      .where(and(eq(rbfrFormulaReviews.reviewerId, reviewerId), eq(rbfrFormulaReviews.status, 'REVIEWING')))
      .orderBy(rbfrFormulaReviews.requestedAt);
    return rows.map(toReviewSummary);
  }

  async updateReviewStatus(
    reviewId: number,
    patch: { status: FormulaReviewSummary['status']; reviewerId?: number; comment?: string; decidedAt?: string },
  ): Promise<FormulaReviewSummary> {
    const [row] = await groupwareDb
      .update(rbfrFormulaReviews)
      .set({
        status: patch.status,
        reviewerId: patch.reviewerId,
        comment: patch.comment,
        decidedAt: patch.decidedAt ? new Date(patch.decidedAt) : undefined,
      })
      .where(eq(rbfrFormulaReviews.id, reviewId))
      .returning();
    return toReviewSummary(row);
  }
}

function toReviewSummary(row: typeof rbfrFormulaReviews.$inferSelect): FormulaReviewSummary {
  return {
    id: row.id,
    formulaId: row.formulaId,
    requestedBy: row.requestedBy,
    reviewerId: row.reviewerId ?? undefined,
    status: row.status,
    comment: row.comment ?? undefined,
    requestedAt: row.requestedAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : undefined,
  };
}
