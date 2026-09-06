import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateFormulaIngredientDto {
  @IsInt()
  ingredientId: number;

  @IsNumber()
  @Min(0)
  actualPct: number;
}

/** POST /rbfr-api/formulas 본문. 02_화면구성.md 탭1 "정방향 계산"의 입력부. */
export class CreateFormulaDto {
  @IsString()
  @IsNotEmpty()
  projectName: string;

  @IsString()
  @IsNotEmpty()
  formulaName: string;

  @IsOptional()
  @IsInt()
  ownerId?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateFormulaIngredientDto)
  ingredients: CreateFormulaIngredientDto[];
}
