import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 조직 루트 관리자 교체 요청(내부: 플랫폼 위임): 조직에 계정이 없는 사람을 루트로 세운다.
 * 비밀번호 복잡도는 조직 생성(CreateOrganizationDto)과 동일하게 유지한다(수동 동기화)
 */
export class ReplaceRootAdminDto {
  @ApiProperty({ description: '새 루트 관리자 이메일(로그인 ID)', example: 'root@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: '새 루트 관리자 이름(표시 이름)', example: '홍길동' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: '초기 비밀번호: 8자 이상, 영문 대문자/소문자/숫자/특수문자 각 1자 이상',
    example: 'RootPw1!',
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
}
