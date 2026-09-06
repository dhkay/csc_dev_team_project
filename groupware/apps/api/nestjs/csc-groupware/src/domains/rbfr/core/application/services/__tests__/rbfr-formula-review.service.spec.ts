import { Test, TestingModule } from '@nestjs/testing';
import { RbfrFormulaReviewService } from '../rbfr-formula-review.service';
import { RBFR_FORMULA_REVIEW_REPOSITORY_PORT } from '../../ports/outbound';
import type { RbfrFormulaReviewRepositoryPort } from '../../ports/outbound';
import { RBFR_FORMULA_VERSION_PORT } from '../../ports/inbound';
import type { RbfrFormulaVersionPort } from '../../ports/inbound';
import type { FormulaReviewSummary, FormulaVersionSummary } from '../../../domain/types';

describe('RbfrFormulaReviewService', () => {
  let service: RbfrFormulaReviewService;
  let reviewRepository: jest.Mocked<RbfrFormulaReviewRepositoryPort>;
  let formulaVersion: jest.Mocked<RbfrFormulaVersionPort>;

  const makeReview = (overrides: Partial<FormulaReviewSummary> = {}): FormulaReviewSummary => ({
    id: 1,
    formulaId: 10,
    requestedBy: 1,
    status: 'PENDING',
    requestedAt: '2026-09-06T00:00:00.000Z',
    ...overrides,
  });

  beforeEach(async () => {
    reviewRepository = {
      findFormulaOwnerStatus: jest.fn(),
      updateFormulaStatus: jest.fn(),
      createReview: jest.fn(),
      findReview: jest.fn(),
      listReviewsByFormula: jest.fn(),
      listPendingReviews: jest.fn(),
      listReviewsByReviewer: jest.fn(),
      updateReviewStatus: jest.fn(),
    };
    formulaVersion = { confirmFormula: jest.fn(), listVersions: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbfrFormulaReviewService,
        { provide: RBFR_FORMULA_REVIEW_REPOSITORY_PORT, useValue: reviewRepository },
        { provide: RBFR_FORMULA_VERSION_PORT, useValue: formulaVersion },
      ],
    }).compile();

    service = module.get(RbfrFormulaReviewService);
  });

  describe('requestReview', () => {
    it('존재하지 않는 처방이면 에러를 던진다', async () => {
      reviewRepository.findFormulaOwnerStatus.mockResolvedValueOnce(undefined);
      await expect(service.requestReview(10, 1)).rejects.toThrow();
      expect(reviewRepository.createReview).not.toHaveBeenCalled();
    });

    it('DRAFT/CALC가 아니면 검수 요청을 거부한다', async () => {
      reviewRepository.findFormulaOwnerStatus.mockResolvedValueOnce({ ownerId: 1, status: 'REVIEW' });
      await expect(service.requestReview(10, 1)).rejects.toThrow();
      expect(reviewRepository.createReview).not.toHaveBeenCalled();
    });

    it('DRAFT면 검수 요청을 만들고 처방 상태를 REVIEW로 바꾼다', async () => {
      reviewRepository.findFormulaOwnerStatus.mockResolvedValueOnce({ ownerId: 1, status: 'DRAFT' });
      reviewRepository.createReview.mockResolvedValueOnce(makeReview());

      await service.requestReview(10, 1);

      expect(reviewRepository.createReview).toHaveBeenCalledWith(10, 1);
      expect(reviewRepository.updateFormulaStatus).toHaveBeenCalledWith(10, 'REVIEW');
    });
  });

  describe('listMyAssignedReviews', () => {
    it('reviewerId를 그대로 위임한다', async () => {
      reviewRepository.listReviewsByReviewer.mockResolvedValueOnce([makeReview({ status: 'REVIEWING', reviewerId: 2 })]);
      const result = await service.listMyAssignedReviews(2);
      expect(result).toEqual([makeReview({ status: 'REVIEWING', reviewerId: 2 })]);
      expect(reviewRepository.listReviewsByReviewer).toHaveBeenCalledWith(2);
    });
  });

  describe('pickupReview', () => {
    it('존재하지 않는 검수 요청이면 에러를 던진다', async () => {
      reviewRepository.findReview.mockResolvedValueOnce(undefined);
      await expect(service.pickupReview(1, 2)).rejects.toThrow();
    });

    it('PENDING이 아니면 배정할 수 없다', async () => {
      reviewRepository.findReview.mockResolvedValueOnce(makeReview({ status: 'REVIEWING' }));
      await expect(service.pickupReview(1, 2)).rejects.toThrow();
      expect(reviewRepository.updateReviewStatus).not.toHaveBeenCalled();
    });

    it('처방 소유자 본인은 배정받을 수 없다(자기 검수 금지)', async () => {
      reviewRepository.findReview.mockResolvedValueOnce(makeReview({ status: 'PENDING' }));
      reviewRepository.findFormulaOwnerStatus.mockResolvedValueOnce({ ownerId: 2, status: 'REVIEW' });
      await expect(service.pickupReview(1, 2)).rejects.toThrow();
      expect(reviewRepository.updateReviewStatus).not.toHaveBeenCalled();
    });

    it('소유자가 아니고 PENDING이면 REVIEWING으로 배정한다', async () => {
      reviewRepository.findReview.mockResolvedValueOnce(makeReview({ status: 'PENDING' }));
      reviewRepository.findFormulaOwnerStatus.mockResolvedValueOnce({ ownerId: 1, status: 'REVIEW' });
      reviewRepository.updateReviewStatus.mockResolvedValueOnce(makeReview({ status: 'REVIEWING', reviewerId: 2 }));

      await service.pickupReview(1, 2);

      expect(reviewRepository.updateReviewStatus).toHaveBeenCalledWith(1, { status: 'REVIEWING', reviewerId: 2 });
    });
  });

  describe('decideReview', () => {
    it('REVIEWING이 아니면 결정할 수 없다', async () => {
      reviewRepository.findReview.mockResolvedValueOnce(makeReview({ status: 'PENDING' }));
      await expect(service.decideReview(1, 'APPROVED')).rejects.toThrow();
      expect(reviewRepository.updateFormulaStatus).not.toHaveBeenCalled();
    });

    it('APPROVED인데 profileCode가 없으면 거부하고 스냅샷을 만들지 않는다', async () => {
      reviewRepository.findReview.mockResolvedValueOnce(makeReview({ status: 'REVIEWING', reviewerId: 2 }));
      await expect(service.decideReview(1, 'APPROVED')).rejects.toThrow();
      expect(formulaVersion.confirmFormula).not.toHaveBeenCalled();
      expect(reviewRepository.updateReviewStatus).not.toHaveBeenCalled();
    });

    it('스냅샷 생성이 실패하면 검수/처방 상태를 그대로 두고 에러를 전파한다', async () => {
      reviewRepository.findReview.mockResolvedValueOnce(makeReview({ status: 'REVIEWING', reviewerId: 2 }));
      formulaVersion.confirmFormula.mockRejectedValueOnce(new Error('승인된 Cell 규칙 판이 없습니다.'));

      await expect(service.decideReview(1, 'APPROVED', undefined, 'SKIN')).rejects.toThrow();

      expect(reviewRepository.updateReviewStatus).not.toHaveBeenCalled();
      expect(reviewRepository.updateFormulaStatus).not.toHaveBeenCalled();
    });

    it('APPROVED면 버전 스냅샷을 먼저 만들고 처방 상태를 FIXED로 바꾼다', async () => {
      reviewRepository.findReview.mockResolvedValueOnce(makeReview({ status: 'REVIEWING', reviewerId: 2 }));
      formulaVersion.confirmFormula.mockResolvedValueOnce({ id: 1 } as FormulaVersionSummary);
      reviewRepository.updateReviewStatus.mockResolvedValueOnce(makeReview({ status: 'APPROVED' }));

      await service.decideReview(1, 'APPROVED', '문제 없음', 'SKIN');

      expect(formulaVersion.confirmFormula).toHaveBeenCalledWith(10, 'SKIN', 2);
      expect(reviewRepository.updateFormulaStatus).toHaveBeenCalledWith(10, 'FIXED');
    });

    it('CHANGES면 스냅샷을 만들지 않고 처방 상태를 DRAFT로 되돌린다', async () => {
      reviewRepository.findReview.mockResolvedValueOnce(makeReview({ status: 'REVIEWING' }));
      reviewRepository.updateReviewStatus.mockResolvedValueOnce(makeReview({ status: 'CHANGES' }));

      await service.decideReview(1, 'CHANGES', '농도 조정 필요');

      expect(formulaVersion.confirmFormula).not.toHaveBeenCalled();
      expect(reviewRepository.updateFormulaStatus).toHaveBeenCalledWith(10, 'DRAFT');
    });

    it('REJECTED면 처방 상태를 DRAFT로 되돌린다', async () => {
      reviewRepository.findReview.mockResolvedValueOnce(makeReview({ status: 'REVIEWING' }));
      reviewRepository.updateReviewStatus.mockResolvedValueOnce(makeReview({ status: 'REJECTED' }));

      await service.decideReview(1, 'REJECTED');

      expect(reviewRepository.updateFormulaStatus).toHaveBeenCalledWith(10, 'DRAFT');
    });
  });
});
