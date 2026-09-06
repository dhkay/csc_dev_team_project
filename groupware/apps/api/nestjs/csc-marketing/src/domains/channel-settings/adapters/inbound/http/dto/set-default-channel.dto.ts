import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * 진입 채널 지정(개인). channelId 생략이나 null 이면 지정 해제(첫 채널로 복귀)
 * 채널 존재는 미검증(지정 후 삭제될 수 있어 읽는 쪽이 목록으로 확인)
 */
export class SetDefaultChannelDto {
  @IsInt()
  organizationId: number;

  // 지정 주체(조직유저) id. BFF 가 세션에서 도출해 전달
  @IsInt()
  ownerUserId: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  channelId?: number | null;
}
