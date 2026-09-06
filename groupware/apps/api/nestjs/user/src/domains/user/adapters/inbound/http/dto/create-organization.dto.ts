import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 신규 회사 ROOT 관리자 입력 */
export class RootAdminDto {
  @ApiProperty({ description: 'ROOT 관리자 이메일(로그인 ID)', example: 'root@acme.kr' })
  @IsEmail()
  email: string;

  // 비밀번호 복잡도: web passwordPolicy.ts(PASSWORD_RULES)와 동일하게 유지(수동 동기화)
  @ApiProperty({
    description: '초기 비밀번호: 8자 이상, 영문 대문자/소문자/숫자/특수문자 각 1자 이상',
    example: 'RootPw123!',
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

  @ApiProperty({ description: 'ROOT 관리자 표시 이름', example: '관리자' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

/** 신규 회사(조직) 생성 입력: 내부(서비스토큰) 전용 */
export class CreateOrganizationDto {
  // 조직 slug: 소문자/숫자/하이픈
  @ApiProperty({
    description: '조직 slug: 소문자/숫자/하이픈만 허용',
    example: 'acme-corp',
  })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug 은 소문자/숫자/하이픈만 허용합니다.' })
  slug: string;

  @ApiProperty({ description: '조직(회사) 이름', example: '에이크미 주식회사' })
  @IsString()
  @IsNotEmpty()
  name: string;

  // 조직 프로필 이미지(로고) 접근 URL: file-upload 저장 후 access_url.
  @ApiPropertyOptional({
    description: '조직 프로필 이미지(로고) 접근 URL: file-upload 저장 후 access_url',
    example: 'https://cdn.csc.kr/files/abc123',
    maxLength: 2048,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  profileImageUrl?: string;

  @ApiProperty({ description: '신규 회사 ROOT 관리자 정보', type: RootAdminDto })
  @ValidateNested()
  @Type(() => RootAdminDto)
  rootAdmin: RootAdminDto;
}
