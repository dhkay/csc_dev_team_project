import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

/** POST /rbfr-api/ingredients/:ingredientId/cas 본문. */
export class CreateCasDto {
	@IsString()
	@IsNotEmpty()
	casNo: string;

	@IsOptional()
	@IsString()
	note?: string;
}

/** POST /rbfr-api/ingredients/:ingredientId/regulations 본문. 10개국 카드 중 1건. */
export class CreateRegulationDto {
	@IsString()
	@IsNotEmpty()
	countryCode: string;

	@IsIn(['ALLOW', 'BAN', 'LIMIT', 'COND', 'NODATA'])
	regType: 'ALLOW' | 'BAN' | 'LIMIT' | 'COND' | 'NODATA';

	@IsOptional()
	@IsIn(['CONFIRMED', 'PROPOSED', 'REJECTED'])
	status?: 'CONFIRMED' | 'PROPOSED' | 'REJECTED';

	@IsOptional()
	@IsNumber()
	limitPct?: number;

	@IsOptional()
	@IsString()
	conditionTxt?: string;

	@IsOptional()
	@IsString()
	source?: string;

	@IsOptional()
	@IsString()
	sourceUrl?: string;

	@IsOptional()
	@IsString()
	note?: string;
}

/** POST /rbfr-api/ingredients/:ingredientId/certs 본문. 비건/유기농/NMPA/저자극 등. */
export class CreateCertDto {
	@IsString()
	@IsNotEmpty()
	certCode: string;

	@IsBoolean()
	isEligible: boolean;

	@IsOptional()
	@IsString()
	issuer?: string;

	@IsOptional()
	@IsString()
	certNo?: string;

	@IsOptional()
	@IsString()
	docUrl?: string;

	@IsOptional()
	@IsString()
	validUntil?: string;

	@IsOptional()
	@IsString()
	note?: string;
}

/** POST /rbfr-api/ingredients/:ingredientId/flags 본문. 파라벤류/PEG류 등 무첨가 분류. */
export class CreateFlagDto {
	@IsString()
	@IsNotEmpty()
	noaddCode: string;
}

/** POST /rbfr-api/ingredient-interactions 본문. 원료쌍 조합계수(시너지/충돌). */
export class CreateInteractionDto {
	@IsInt()
	ingredientAId: number;

	@IsInt()
	ingredientBId: number;

	@IsString()
	@IsNotEmpty()
	domainCode: string;

	@IsIn(['synergy', 'conflict', 'neutral', 'unknown'])
	interactionType: 'synergy' | 'conflict' | 'neutral' | 'unknown';

	@IsOptional()
	@IsNumber()
	coefficient?: number;

	@IsOptional()
	@IsIn(['low', 'medium', 'high'])
	confidenceLevel?: 'low' | 'medium' | 'high';

	@IsOptional()
	@IsIn(['manual_estimate', 'lab_test', 'literature', 'expert_review', 'unknown'])
	dataSource?: 'manual_estimate' | 'lab_test' | 'literature' | 'expert_review' | 'unknown';

	@IsOptional()
	@IsString()
	notes?: string;
}

/** POST /rbfr-api/ingredient-incompat 본문. 원료쌍 병용금기(BLOCK/WARN). */
export class CreateIncompatDto {
	@IsInt()
	ingredientId: number;

	@IsInt()
	otherId: number;

	@IsIn(['BLOCK', 'WARN'])
	severity: 'BLOCK' | 'WARN';

	@IsOptional()
	@IsString()
	reason?: string;
}
