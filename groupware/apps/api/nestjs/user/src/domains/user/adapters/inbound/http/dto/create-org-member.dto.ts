import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 조직 일반관리자(ADMIN) 생성 입력: 슈퍼관리자(JWT) 호출 */
export class CreateOrgMemberDto {
  @ApiProperty({ description: '멤버 이메일(로그인 ID)', example: 'member@acme.kr' })
  @IsEmail({}, { message: '올바른 이메일을 입력하세요.' })
  email: string;

  // 비밀번호 복잡도: groupware passwordPolicy.ts(PASSWORD_RULES)와 동일하게 유지(수동 동기화)
  @ApiProperty({
    description: '초기 비밀번호: 8자 이상, 영문 대문자/소문자/숫자/특수문자 각 1자 이상',
    example: 'MemberPw1!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: '비밀번호는 8자 이상이어야 합니다.' })
  @Matches(/[A-Z]/, { message: '비밀번호에 영문 대문자를 포함해야 합니다.' })
  @Matches(/[a-z]/, { message: '비밀번호에 영문 소문자를 포함해야 합니다.' })
  @Matches(/[0-9]/, { message: '비밀번호에 숫자를 포함해야 합니다.' })
  @Matches(/[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-]/, {
    message: '비밀번호에 특수문자를 포함해야 합니다.',
  })
  password: string;

  // 소속 부서 id: null/미지정이면 미배치.
  @ApiPropertyOptional({
    description: '소속 부서 id: null/미지정이면 미배치',
    example: 5,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((o) => o.departmentId !== null)
  @IsInt()
  departmentId?: number | null;

  // 표시이름: organization_users.name 에 저장.
  @ApiProperty({ description: '표시이름', example: '김철수', maxLength: 100 })
  @IsString()
  @IsNotEmpty({ message: '표시이름을 입력하세요.' })
  @MaxLength(100)
  name: string;

  // 전화번호(선택): 공란 가능(null/미지정).
  @ApiPropertyOptional({
    description: '전화번호(선택): 공란 가능',
    example: '010-1234-5678',
    maxLength: 30,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  // 사내번호(선택): 공란 가능(null/미지정).
  @ApiPropertyOptional({
    description: '사내번호(선택): 공란 가능',
    example: '1024',
    maxLength: 30,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  extension?: string | null;
}
