import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** rbfr_ingredient_roles 한 행 입력(직접역할만, 05번 원칙5). */
export class RoleContributionDto {
  @IsString()
  @IsNotEmpty()
  domainCode: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  contribution: number;

  @IsOptional()
  @IsString()
  evidence?: string;
}

/** POST /rbfr-api/ingredients 본문. 02_화면구성.md 탭3 "원료 기본정보" + "직접 역할 기여도". */
export class CreateIngredientDto {
  @IsString()
  @IsNotEmpty()
  inciName: string;

  @IsString()
  @IsNotEmpty()
  nameKo: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  concMin?: number;

  @IsOptional()
  @IsNumber()
  concMax?: number;

  @IsOptional()
  @IsNumber()
  phMin?: number;

  @IsOptional()
  @IsNumber()
  phMax?: number;

  @IsOptional()
  @IsNumber()
  hlb?: number;

  @IsOptional()
  @IsString()
  emulsionRole?: string;

  @IsOptional()
  @IsString()
  solubility?: string;

  @IsOptional()
  @IsBoolean()
  isBase?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleContributionDto)
  contributions: RoleContributionDto[];
}
