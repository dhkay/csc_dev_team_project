import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * POST /rbfr-api/formulas/:formulaId/sensory-stability 본문. 척도는 0~100으로 잠정
 * 채택했다(확인 필요, rbfr-formula-sensory-stability.types.ts 참고).
 */
export class CreateSensoryStabilityRecordDto {
	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(100)
	stickinessScore?: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(100)
	freshnessScore?: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(100)
	absorptionScore?: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(100)
	spreadabilityScore?: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(100)
	afterfeelScore?: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(100)
	viscosityScore?: number;

	@IsOptional()
	@IsIn(['상', '중', '하'])
	separationRisk?: '상' | '중' | '하';

	@IsOptional()
	@IsIn(['상', '중', '하'])
	precipitationRisk?: '상' | '중' | '하';

	@IsOptional()
	@IsIn(['상', '중', '하'])
	colorChangeRisk?: '상' | '중' | '하';

	@IsOptional()
	@IsIn(['상', '중', '하'])
	odorChangeRisk?: '상' | '중' | '하';

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(100)
	phStabilityScore?: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(100)
	heatStabilityScore?: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(100)
	lowTempStabilityScore?: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(100)
	overallStabilityScore?: number;

	@IsOptional()
	@IsString()
	testCondition?: string;

	@IsOptional()
	@IsIn(['manual_estimate', 'lab_test', 'literature', 'expert_review', 'unknown'])
	dataSource?: 'manual_estimate' | 'lab_test' | 'literature' | 'expert_review' | 'unknown';

	@IsOptional()
	@IsIn(['low', 'medium', 'high'])
	confidenceLevel?: 'low' | 'medium' | 'high';

	@IsOptional()
	@IsString()
	notes?: string;
}
