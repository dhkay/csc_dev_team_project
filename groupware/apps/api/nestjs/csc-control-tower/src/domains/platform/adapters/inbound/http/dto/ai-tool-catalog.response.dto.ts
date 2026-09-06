import { ApiProperty } from '@nestjs/swagger';
import { ProvisioningMode } from '@csc/entitlements';
import { AiToolCatalogItem } from '../../../../core/domain/ai-tool.types';

/** AI 도구 카탈로그 1건. key 는 코드 고정값이라 수정 대상이 아니다. */
export class AiToolCatalogItemResponseDto implements AiToolCatalogItem {
  @ApiProperty({ description: 'AI 도구 key(코드 고정값)', example: 'marketing-video' })
  key: string;

  @ApiProperty({ description: '표시명', example: '마케팅 영상 제작' })
  name: string;

  @ApiProperty({ description: '주소에 쓰이는 slug', example: 'marketing-video' })
  slug: string;

  @ApiProperty({ description: '설명. 없으면 null', example: null, nullable: true })
  description: string | null;

  @ApiProperty({
    description: '제공 방식: PER_ORG(조직마다 부여) 또는 COMMON(전 조직 공통 제공)',
    enum: ProvisioningMode,
    example: ProvisioningMode.PerOrg,
  })
  provisioning: ProvisioningMode;

  @ApiProperty({ description: '사용 여부', example: true })
  isActive: boolean;

  @ApiProperty({ description: '표시 순서', example: 1 })
  sortOrder: number;
}
