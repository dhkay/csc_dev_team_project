import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginEmailDto {
  @ApiProperty({ description: '로그인 이메일', example: 'user@csc.kr' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: '로그인 비밀번호', example: 'MyPassword1!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
