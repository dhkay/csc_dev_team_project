import { IsOptional, IsString, IsNotEmpty, IsIn, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ALL_PROVISIONING_MODES, ProvisioningMode } from '@csc/entitlements';

/** AI 도구 카탈로그 수정 요청 (플랫폼 관리자): 표시명/slug/프로비저닝. key/enum 고정 */
export class UpdateAiToolDto {
  @ApiPropertyOptional({
    description: 'AI 도구 표시명',
    example: '마케팅 영상 제작',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    description: 'AI 도구 slug: 소문자/숫자/하이픈만 허용',
    example: 'marketing-video',
    maxLength: 64,
  })
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug 은 소문자/숫자/하이픈만 허용합니다.' })
  @MaxLength(64)
  slug?: string;

  @ApiPropertyOptional({
    description: 'AI 도구 프로비저닝 모드: PER_ORG(조직 개별 부여) | COMMON(전 조직 공통 제공)',
    enum: ALL_PROVISIONING_MODES,
    example: ProvisioningMode.PerOrg,
  })
  @IsOptional()
  @IsIn(ALL_PROVISIONING_MODES)
  provisioning?: ProvisioningMode;
}
