import { ApiProperty } from '@nestjs/swagger';
import { CreatedCompany, OrganizationSummary } from '../../../../core/domain/organization.types';

/** 조직 요약 */
export class OrganizationSummaryResponseDto implements OrganizationSummary {
  @ApiProperty({ description: '조직 id', example: 12 })
  id: number;

  @ApiProperty({ description: '조직 식별 slug(주소에 쓰인다)', example: 'acme-corp' })
  slug: string;

  @ApiProperty({ description: '조직명', example: 'ACME Corp' })
  name: string;

  @ApiProperty({
    description: '조직 종류: TENANT(납품 조직) 또는 PLATFORM(운영사)',
    example: 'TENANT',
  })
  type: string;

  @ApiProperty({ description: '조직 상태: ACTIVE/SUSPENDED/WITHDRAWN', example: 'ACTIVE' })
  status: string;

  @ApiProperty({
    description: '조직 로고 접근 URL. 없으면 null',
    example: null,
    nullable: true,
    required: false,
  })
  profileImageUrl?: string | null;

  @ApiProperty({ description: '생성 시각(ISO 8601)', example: '2026-01-05T09:00:00.000Z' })
  createdAt: string;
}

/** 조직 생성 응답에 담기는 조직 정보 */
export class CreatedOrganizationResponseDto {
  @ApiProperty({ description: '조직 id', example: 12 })
  id: number;

  @ApiProperty({ description: '조직 식별 slug', example: 'acme-corp' })
  slug: string;

  @ApiProperty({ description: '조직명', example: 'ACME Corp' })
  name: string;

  @ApiProperty({ description: '조직 종류', example: 'TENANT' })
  type: string;

  @ApiProperty({
    description: '조직 로고 접근 URL. 없으면 null',
    example: null,
    nullable: true,
    required: false,
  })
  profileImageUrl?: string | null;
}

/** 조직과 함께 만들어진 루트 관리자(비밀번호는 응답에 담지 않는다) */
export class CreatedRootAdminResponseDto {
  @ApiProperty({ description: '조직유저 id', example: 42 })
  id: number;

  @ApiProperty({ description: '이메일(로그인 ID)', example: 'root@acme.co' })
  email: string;

  @ApiProperty({ description: '이름', example: '홍길동' })
  name: string;
}

/** 조직 생성 결과: 조직과 그 조직의 루트 관리자 */
export class CreatedCompanyResponseDto implements CreatedCompany {
  @ApiProperty({ description: '생성된 조직', type: CreatedOrganizationResponseDto })
  organization: CreatedOrganizationResponseDto;

  @ApiProperty({ description: '생성된 루트 관리자', type: CreatedRootAdminResponseDto })
  rootAdmin: CreatedRootAdminResponseDto;
}
