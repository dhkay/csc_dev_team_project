import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** 부서 수정 입력: 제공된 필드만(이름 변경 / 이동) */
export class UpdateDepartmentDto {
  @ApiPropertyOptional({ description: '부서 이름(변경 시)', example: '플랫폼개발팀', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '부서 이름을 입력하세요.' })
  @MaxLength(100)
  name?: string;

  // 상위 부서 변경(이동). null=최상위로, 미지정=변경 안 함
  @ApiPropertyOptional({
    description: '상위 부서 변경(이동): null=최상위로, 미지정=변경 안 함',
    example: 2,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((o) => o.parentId !== null)
  @IsInt()
  parentId?: number | null;
}
