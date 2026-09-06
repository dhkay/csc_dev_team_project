import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** 조직 일반관리자 수정 입력: 제공된 필드만(표시이름 / 소속 부서) */
export class UpdateOrgMemberDto {
  // 표시이름: organization_users.name.
  @ApiPropertyOptional({ description: '표시이름', example: '김철수', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '표시이름을 입력하세요.' })
  @MaxLength(100)
  name?: string;

  // 로그인 이메일: 미지정=변경 안 함. 조직 내 중복이면 409.
  @ApiPropertyOptional({
    description: '로그인 이메일(로그인 ID): 변경 시 이전 주소로는 로그인할 수 없다',
    example: 'member@acme.kr',
    maxLength: 255,
  })
  @IsOptional()
  @IsEmail({}, { message: '올바른 이메일을 입력하세요.' })
  @MaxLength(255)
  email?: string;

  // 소속 부서: number=배치, null=미배치, 미지정=변경 안 함
  @ApiPropertyOptional({
    description: '소속 부서: number=배치, null=미배치, 미지정=변경 안 함',
    example: 5,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((o) => o.departmentId !== null)
  @IsInt()
  departmentId?: number | null;

  // 전화번호: string=설정(빈문자 가능), null=비움, 미지정=변경 안 함
  @ApiPropertyOptional({
    description: '전화번호: string=설정(빈문자 가능), null=비움, 미지정=변경 안 함',
    example: '010-1234-5678',
    maxLength: 30,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  // 사내번호: string=설정(빈문자 가능), null=비움, 미지정=변경 안 함
  @ApiPropertyOptional({
    description: '사내번호: string=설정(빈문자 가능), null=비움, 미지정=변경 안 함',
    example: '1024',
    maxLength: 30,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  extension?: string | null;
}
