import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 신규 회사 생성 요청 (플랫폼 관리자) */
export class CreateOrganizationDto {
  @ApiProperty({ description: '회사(조직) 이름', example: '비즈오피스' })
  @IsString()
  @IsNotEmpty()
  companyName: string;

  // 조직 slug: 소문자/숫자/하이픈
  @ApiProperty({
    description: '조직 slug: 소문자/숫자/하이픈만 허용',
    example: 'biz-office',
  })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug 은 소문자/숫자/하이픈만 허용합니다.' })
  slug: string;

  @ApiProperty({ description: '조직 ROOT 관리자 이메일', example: 'root@biz-office.kr' })
  @IsEmail()
  adminEmail: string;

  @ApiProperty({ description: '조직 ROOT 관리자 비밀번호(8자 이상)', example: 'P@ssw0rd!' })
  @IsString()
  @MinLength(8)
  adminPassword: string;

  @ApiProperty({ description: '조직 ROOT 관리자 이름', example: '홍길동' })
  @IsString()
  @IsNotEmpty()
  adminName: string;

  // 조직 프로필 이미지(로고) 접근 URL: file-upload 저장 후 access_url.
  @ApiPropertyOptional({
    description: '조직 프로필 이미지(로고) 접근 URL: file-upload access_url',
    example: 'https://cdn.example.com/files/abc-123',
    maxLength: 2048,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  profileImageUrl?: string;
}
