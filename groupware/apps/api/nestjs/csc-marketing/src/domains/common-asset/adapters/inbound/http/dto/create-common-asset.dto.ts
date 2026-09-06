import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { COMMON_ASSET_CATEGORIES, CommonAssetCategory } from '../../../../core/domain';

export class CreateCommonAssetDto {
  @IsIn([...COMMON_ASSET_CATEGORIES])
  category: CommonAssetCategory;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  uploadId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  mimeType: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  sizeBytes?: number;

  // 카탈로그 태그 id 목록. 서비스가 카테고리 축에 속한 유효 태그만 남긴다.
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  tagIds?: number[];

  // 소유 조직 id: 있으면 scope='organization'(그룹웨어 BFF 주입), 없으면 scope='common'(플랫폼)
  @IsInt()
  @IsOptional()
  @Min(1)
  organizationId?: number;

  @IsInt()
  @IsOptional()
  createdByAdminId?: number;
}
