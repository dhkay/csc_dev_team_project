import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 조직 ROOT 관리자 수정 요청(내부: 플랫폼 위임): 제공된 필드만(name, email)
 * 이름은 유일한 이름 필드다(표시 이름). 조직 내 중복을 허용하므로 중복 검사는 없다.
 * 이메일은 로그인 ID 이며 전체에서 유일하다(UNIQUE email)
 */
export class UpdateRootAdminDto {
  @ApiPropertyOptional({
    description: '조직 ROOT 관리자 이름(표시 이름)',
    example: '홍길동',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: '이름을 입력해 주세요.' })
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: '조직 ROOT 관리자 이메일(로그인 ID). 조직유저 전체에서 유일해야 한다.',
    example: 'root@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
