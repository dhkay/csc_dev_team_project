import { IsNotEmpty, IsString } from 'class-validator';

/** GET /rbfr-api/formulas/:formulaId/calculate 쿼리. profileCode는 rbfr_profiles.profile_code(예: 'SKIN'). */
export class CalculateFormulaQueryDto {
  @IsString()
  @IsNotEmpty()
  profileCode: string;
}
