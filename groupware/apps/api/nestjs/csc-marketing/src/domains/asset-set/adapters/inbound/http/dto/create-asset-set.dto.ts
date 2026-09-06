import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SetOverlaysDto } from './set-overlays.dto';

export class CreateAssetSetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  name: string;

  // 소유 조직 id: 있으면 scope='organization'(그룹웨어 BFF 주입), 없으면 scope='common'(플랫폼)
  @IsInt()
  @IsOptional()
  @Min(1)
  organizationId?: number;

  // 감사: 생성한 플랫폼 관리자(admin_users.id). control-tower BFF 주입, 조직 생성 시 미전달(null)
  @IsInt()
  @IsOptional()
  createdByAdminId?: number;

  // 구역별 오버레이 스타일(제목/자막 배경색+폰트): 미지정이면 기본값
  @IsOptional()
  @ValidateNested()
  @Type(() => SetOverlaysDto)
  overlays?: SetOverlaysDto;
}
