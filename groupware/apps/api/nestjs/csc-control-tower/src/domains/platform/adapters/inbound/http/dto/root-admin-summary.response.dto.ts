import { ApiProperty } from '@nestjs/swagger';
import { OrgMemberSummary, RootAdminSummary } from '../../../../core/domain/organization.types';

/** 조직 루트 관리자 요약 */
export class RootAdminSummaryResponseDto implements RootAdminSummary {
  @ApiProperty({ description: '조직유저 id', example: 42 })
  id: number;

  @ApiProperty({ description: '이메일(로그인 ID)', example: 'root@acme.co' })
  email: string;

  @ApiProperty({ description: '이름(표시 이름)', example: '홍길동' })
  name: string;

  @ApiProperty({ description: '계정 상태: ACTIVE/LOCKED/INACTIVE/WITHDRAWN', example: 'ACTIVE' })
  status: string;

  @ApiProperty({
    description: '마지막 로그인 시각(ISO 8601). 로그인 기록이 없으면 null',
    example: '2026-08-12T00:02:17.101Z',
    nullable: true,
  })
  lastLoginAt: string | null;
}

/** 조직 멤버 요약(루트 관리자와 일반관리자, 삭제된 멤버 제외) */
export class OrgMemberSummaryResponseDto implements OrgMemberSummary {
  @ApiProperty({ description: '조직유저 id', example: 43 })
  id: number;

  @ApiProperty({ description: '이메일(로그인 ID)', example: 'member@acme.co' })
  email: string;

  @ApiProperty({ description: '이름(표시 이름)', example: '김철수' })
  name: string;

  @ApiProperty({ description: '역할: ROOT(루트) 또는 ADMIN(일반)', example: 'ADMIN' })
  role: string;

  @ApiProperty({ description: '계정 상태', example: 'ACTIVE' })
  status: string;

  @ApiProperty({
    description: '마지막 로그인 시각(ISO 8601). 없으면 null',
    example: '2026-07-28T00:56:55.337Z',
    nullable: true,
  })
  lastLoginAt: string | null;
}
