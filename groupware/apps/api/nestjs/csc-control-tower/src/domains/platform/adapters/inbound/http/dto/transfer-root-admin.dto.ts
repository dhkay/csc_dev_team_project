import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** 조직 루트 관리자 이양 요청: 대상은 그 조직의 활성 일반관리자 */
export class TransferRootAdminDto {
  @ApiProperty({
    description: '루트 관리자로 올릴 조직유저 id. 목록은 /platform/organizations/{id}/members 로 조회한다.',
    example: 42,
  })
  @IsInt()
  @Min(1)
  userId: number;
}
