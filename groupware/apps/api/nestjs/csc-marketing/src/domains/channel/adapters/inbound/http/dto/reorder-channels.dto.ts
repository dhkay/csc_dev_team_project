import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class ReorderChannelsDto {
  @IsInt()
  organizationId: number;

  // 채널 주인(조직유저) id: 채널은 개인 소유라 이 값이 스코프이자 권한이다.
  @IsInt()
  ownerUserId: number;

  // 채널 id 를 표시 순서대로 나열(본인 목록 순서). 순서대로 sort_order 0..n-1.
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  orderedIds: number[];
}
