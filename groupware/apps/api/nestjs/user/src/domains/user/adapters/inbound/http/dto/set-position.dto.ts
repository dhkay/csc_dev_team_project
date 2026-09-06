import { IsIn, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ALL_ORG_POSITIONS, OrgPosition } from '../../../../core/domain/types/entitlement-catalog';

/** 멤버 직책 설정: REPRESENTATIVE(대표) | TEAM_LEADER(팀장) | null(해제) */
export class SetPositionDto {
  @ApiProperty({
    description: '지정할 직책 key(대표/팀장) 또는 null(해제)',
    enum: ALL_ORG_POSITIONS,
    nullable: true,
    example: OrgPosition.TeamLeader,
  })
  // null(해제)은 허용, 값이 있으면 카탈로그 직책 key 만
  @ValidateIf((_o, v) => v !== null)
  @IsIn(ALL_ORG_POSITIONS)
  position: OrgPosition | null;
}
