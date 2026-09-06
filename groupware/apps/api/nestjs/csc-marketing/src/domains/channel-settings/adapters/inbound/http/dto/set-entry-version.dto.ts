import { IsInt, IsString, MaxLength } from 'class-validator';

/**
 * 진입 도구 버전 지정(다음에 도구를 열 때 갈 곳)
 * 값 검증은 서비스 담당(여기서 목록을 한 벌 더 들면 버전 추가 시 두 곳이 어긋남)
 */
export class SetEntryVersionDto {
  @IsInt()
  organizationId: number;

  // 전환 주체(조직유저) id. BFF 가 세션에서 도출해 전달
  @IsInt()
  ownerUserId: number;

  @IsString()
  @MaxLength(16)
  version: string;
}
