import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { SetOverlaysDto } from './set-overlays.dto';

/** 세트 수정: 이름/오버레이 스타일(제공된 필드만) */
export class UpdateAssetSetDto {
  @IsString()
  @IsOptional()
  @MaxLength(300)
  name?: string;

  // 구역별 오버레이 스타일(제목/자막 배경색+폰트). 전달 시 교체
  @IsOptional()
  @ValidateNested()
  @Type(() => SetOverlaysDto)
  overlays?: SetOverlaysDto;
}
