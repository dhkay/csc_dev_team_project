import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

/** POST /rbfr-api/formulas/:formulaId/reviews 본문. */
export class RequestReviewDto {
	@IsInt()
	requestedBy: number;
}

/** POST /rbfr-api/reviews/:reviewId/pickup 본문. */
export class PickupReviewDto {
	@IsInt()
	reviewerId: number;
}

/** POST /rbfr-api/reviews/:reviewId/decide 본문. decision이 APPROVED면 profileCode가 필수다. */
export class DecideReviewDto {
	@IsIn(['APPROVED', 'CHANGES', 'REJECTED'])
	decision: 'APPROVED' | 'CHANGES' | 'REJECTED';

	@IsOptional()
	@IsString()
	comment?: string;

	@IsOptional()
	@IsString()
	profileCode?: string;
}
