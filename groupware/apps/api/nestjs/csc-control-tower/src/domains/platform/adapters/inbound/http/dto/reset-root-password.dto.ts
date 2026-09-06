import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** 조직 ROOT 관리자 비밀번호 재설정 입력 */
export class ResetRootPasswordDto {
  @ApiProperty({ description: '새 비밀번호(8자 이상)', example: 'N3wP@ssw0rd!' })
  @IsString()
  @MinLength(8, { message: '비밀번호는 8자 이상이어야 합니다.' })
  password: string;
}
