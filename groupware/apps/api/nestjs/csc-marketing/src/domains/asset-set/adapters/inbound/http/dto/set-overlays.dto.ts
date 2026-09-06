import { Type } from 'class-transformer';
import {
  IsHexColor,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * 구역 뒷배경 직사각형(밴드) 스타일: 배경색 + 불투명도 + 기하(캔버스 %). null 이면 배경 없음(외곽선 렌더)
 * 기하는 완성 영상에서 리사이즈되는 대상. 세트 편집은 색만 보내고 기하는 렌더러 기본을 쓴다.
 */
export class OverlayBandDto {
  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  opacityPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  xPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  yPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  widthPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  heightPct?: number;
}

/**
 * 구역 텍스트 오버레이 스타일: 세트 편집 UI 는 배경색(band.color)+폰트(fontUploadId)만 쓰지만
 * 공유 커널(TextOverlayStyle) 전체 필드를 수용해 확장 여지를 둔다. shared/domain/overlay 와 동형
 */
export class TextOverlayStyleDto {
  @IsOptional()
  @IsString()
  fontUploadId?: string | null;

  @IsOptional()
  @IsString()
  fontKey?: string;

  @IsOptional()
  @IsNumber()
  sizePct?: number;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OverlayBandDto)
  band?: OverlayBandDto | null;
}

/** 세트 구역별 오버레이 스타일(제목/자막) */
export class SetOverlaysDto {
  @ValidateNested()
  @Type(() => TextOverlayStyleDto)
  title: TextOverlayStyleDto;

  @ValidateNested()
  @Type(() => TextOverlayStyleDto)
  subtitle: TextOverlayStyleDto;
}
