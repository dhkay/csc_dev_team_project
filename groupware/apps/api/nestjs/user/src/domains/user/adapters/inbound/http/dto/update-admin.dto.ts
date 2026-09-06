import { IsEmail, IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** 플랫폼 관리자 수정 요청: 제공된 필드만(name, email). 추후 profileImage 확장 */
export class UpdateAdminDto {
  @ApiPropertyOptional({ description: '관리자 표시 이름', example: '홍길동', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: '관리자 이메일(로그인 ID). 전역 유일이며 루트 관리자는 변경할 수 없다.',
    example: 'admin@csc.kr',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
