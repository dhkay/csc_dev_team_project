import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** 플랫폼 관리자 옵션 일괄 설정 요청 (ROOT 전용) */
export class SetAdminFeaturesDto {
  // 부여할 옵션 key 전체 집합(그대로 동기화)
  @ApiProperty({
    description: '부여할 옵션 key 전체 집합(그대로 동기화)',
    type: [String],
    example: ['org-management', 'ai-tools-management'],
  })
  @IsArray()
  @IsString({ each: true })
  features: string[];
}
