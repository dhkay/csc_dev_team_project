import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

/** 부서 생성 입력: 슈퍼관리자(JWT) 호출 */
export class CreateDepartmentDto {
  // 상위 부서 id: null/미지정이면 최상위(회사 바로 아래)
  @ApiPropertyOptional({
    description: '상위 부서 id: null/미지정이면 최상위(회사 바로 아래)',
    example: 3,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((o) => o.parentId !== null)
  @IsInt()
  parentId?: number | null;

  @ApiProperty({ description: '부서 이름', example: '개발팀', maxLength: 100 })
  @IsString()
  @IsNotEmpty({ message: '부서 이름을 입력하세요.' })
  @MaxLength(100)
  name: string;
}
