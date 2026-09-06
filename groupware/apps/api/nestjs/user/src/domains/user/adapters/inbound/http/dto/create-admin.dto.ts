import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 플랫폼 관리자(ADMIN) 생성 입력: 내부(서비스토큰) 전용 */
export class CreateAdminDto {
  @ApiProperty({ description: '관리자 이메일(로그인 ID)', example: 'admin@csc.kr' })
  @IsEmail()
  email: string;

  // 비밀번호 복잡도: web passwordPolicy.ts(PASSWORD_RULES)와 동일하게 유지(수동 동기화)
  @ApiProperty({
    description: '초기 비밀번호: 8자 이상, 영문 대문자/소문자/숫자/특수문자 각 1자 이상',
    example: 'AdminPw1!',
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

  @ApiProperty({ description: '관리자 이름(표시 이름)', example: '홍길동' })
  @IsString()
  @IsNotEmpty()
  name: string;

  // 초기 부여 옵션 key 목록
  @ApiPropertyOptional({
    description: '초기 부여 옵션 key 목록',
    type: String,
    isArray: true,
    example: ['org-management', 'ai-tools-management'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];
}
