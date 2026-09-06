import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateTagDto {
  @IsInt()
  @Min(1)
  axisId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  value: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  label?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  sortOrder?: number;
}
