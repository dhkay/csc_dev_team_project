import { IsArray, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/** 공통 에셋 수정: 제공된 필드만(표시명 / 태그 id 목록) */
export class UpdateCommonAssetDto {
  @IsString()
  @IsOptional()
  @MaxLength(300)
  name?: string;

  // 카탈로그 태그 id 목록. 제공 시 통째로 교체(유효성 필터는 서비스)
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  tagIds?: number[];
}
