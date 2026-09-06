import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 플랫폼 관리자(ADMIN) 추가 요청 (ROOT 전용) */
export class CreateAdminDto {
  @ApiProperty({ description: '관리자 이메일', example: 'admin@csc.kr' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: '비밀번호(8자 이상)', example: 'P@ssw0rd!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ description: '관리자 이름(표시 이름)', example: '홍길동' })
  @IsString()
  @IsNotEmpty()
  name: string;

  // 초기 부여 옵션 key 목록
  @ApiPropertyOptional({
    description: '초기 부여 옵션 key 목록',
    type: [String],
    example: ['org-management', 'ai-tools-management'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];
}
