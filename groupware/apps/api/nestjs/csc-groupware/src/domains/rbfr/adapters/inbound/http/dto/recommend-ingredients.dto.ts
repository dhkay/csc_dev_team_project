import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, IsNumber, IsString, Max, Min, ValidateNested } from 'class-validator';

/** 목표 역할 도메인 비중(%) 한 항목. */
export class TargetRatioDto {
  @IsString()
  @IsNotEmpty()
  domainCode: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  targetPercent: number;
}

/** POST /rbfr-api/recommendations 본문. 02_화면구성.md 탭2 "역방향 추천". */
export class RecommendIngredientsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TargetRatioDto)
  targetRatios: TargetRatioDto[];
}
