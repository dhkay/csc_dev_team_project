import { IsBoolean } from 'class-validator';

/** PATCH /rbfr-api/profiles/:profileCode/active 본문. */
export class SetProfileActiveDto {
	@IsBoolean()
	isActive: boolean;
}
