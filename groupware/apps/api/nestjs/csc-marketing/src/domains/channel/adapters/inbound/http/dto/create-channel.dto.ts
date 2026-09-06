import { IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateChannelDto {
  @IsInt()
  organizationId: number;

  // 채널 주인(조직유저) id: 채널은 개인 소유라 이 값이 스코프이자 권한이다.
  @IsInt()
  ownerUserId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
