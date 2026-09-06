import { IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** ROOT 관리자 비밀번호 재설정 입력 */
export class ResetRootPasswordDto {
  // 비밀번호 복잡도: web passwordPolicy.ts(PASSWORD_RULES)와 동일하게 유지(수동 동기화)
  @ApiProperty({
    description:
      'ROOT 관리자에게 재설정할 새 비밀번호: 8자 이상, 영문 대문자/소문자/숫자/특수문자 각 1자 이상',
    example: 'RootReset1!',
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
