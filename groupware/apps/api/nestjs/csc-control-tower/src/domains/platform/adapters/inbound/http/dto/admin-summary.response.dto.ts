import { ApiProperty } from '@nestjs/swagger';
import { AdminSummary } from '../../../../core/domain/admin.types';

/**
 * 플랫폼 관리자 요약(비밀번호 해시 제외)
 * 도메인 타입을 구현하므로 응답 형태가 도메인과 어긋나면 빌드가 깨진다(문서 drift 방지)
 */
export class AdminSummaryResponseDto implements AdminSummary {
  @ApiProperty({ description: '플랫폼 관리자 id', example: 2 })
  id: number;

  @ApiProperty({ description: '이메일(로그인 ID)', example: 'admin@csc.kr' })
  email: string;

  @ApiProperty({ description: '이름(표시 이름)', example: '홍길동' })
  name: string;

  @ApiProperty({ description: '역할: ROOT(루트) 또는 ADMIN(일반)', example: 'ADMIN' })
  role: string;

  @ApiProperty({ description: '계정 상태: ACTIVE/LOCKED/INACTIVE/WITHDRAWN', example: 'ACTIVE' })
  status: string;

  @ApiProperty({
    description: '마지막 로그인 시각(ISO 8601). 로그인 기록이 없으면 null',
    example: '2026-08-12T00:02:17.101Z',
    nullable: true,
  })
  lastLoginAt: string | null;

  @ApiProperty({ description: '생성 시각(ISO 8601)', example: '2026-01-05T09:00:00.000Z' })
  createdAt: string;
}

/** 플랫폼 관리자에게 부여할 수 있는 관리 영역 옵션 1건 */
export class AdminFeatureCatalogItemResponseDto {
  @ApiProperty({ description: '옵션 key(코드 고정값)', example: 'org-management' })
  key: string;

  @ApiProperty({ description: '표시명', example: '조직 관리' })
  name: string;

  @ApiProperty({ description: '설명. 없으면 null', example: null, nullable: true })
  description: string | null;

  @ApiProperty({ description: '표시 순서', example: 1 })
  sortOrder: number;
}
