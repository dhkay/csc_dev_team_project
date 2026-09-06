import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ALL_AI_TOOL_KEYS } from '@csc/entitlements';

/** 회사 수정 요청 (플랫폼 관리자): 제공된 필드만 갱신 */
export class UpdateOrganizationDto {
  @ApiPropertyOptional({ description: '조직 이름', example: '비즈오피스' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    description: '조직 slug: 소문자/숫자/하이픈만 허용',
    example: 'biz-office',
  })
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug 은 소문자/숫자/하이픈만 허용합니다.' })
  slug?: string;

  // 활성/정지만. 삭제(WITHDRAWN)는 DELETE 로 처리
  @ApiPropertyOptional({
    description: '조직 상태: 활성/정지만 (삭제는 DELETE 로 처리)',
    enum: ['ACTIVE', 'SUSPENDED'],
    example: 'ACTIVE',
  })
  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';

  // 조직 프로필 이미지(로고) 접근 URL.
  @ApiPropertyOptional({
    description: '조직 프로필 이미지(로고) 접근 URL',
    example: 'https://cdn.example.com/files/abc-123',
    maxLength: 2048,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  profileImageUrl?: string;

  // 부여할 AI도구 key 전체 집합(제공 시 그대로 동기화). 카탈로그(SSOT) key 만 허용: user DTO 와 동일 검증
  @ApiPropertyOptional({
    description:
      '부여할 AI도구 key 전체 집합(제공 시 그대로 동기화). 카탈로그(SSOT) key 만 허용.',
    type: [String],
    example: ['marketing-video'],
  })
  @IsOptional()
  @IsArray()
  @IsIn(ALL_AI_TOOL_KEYS, { each: true })
  aiTools?: string[];
}
