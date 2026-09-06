import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateAxisDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  category: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  key: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  hint?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  sortOrder?: number;
}
