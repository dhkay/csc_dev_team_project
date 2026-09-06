import { IsNotEmpty, IsString } from 'class-validator';

/** POST /rbfr-api/cell-rule-limits/:ruleVersion/approve 본문. */
export class ApproveCellRuleDto {
	@IsString()
	@IsNotEmpty()
	approvedBy: string;
}
