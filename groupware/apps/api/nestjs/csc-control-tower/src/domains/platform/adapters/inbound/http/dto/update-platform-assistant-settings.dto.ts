import { IsBoolean, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 플랫폼 AI 어시스턴트 전역 설정 수정 요청 (플랫폼 관리자): 제공된 필드만
 * commonPrompt 는 null 로 해제
 */
export class UpdatePlatformAssistantSettingsDto {
  @ApiPropertyOptional({ description: '전역 활성화(킬스위치)', example: true })
  @IsOptional()
  @IsBoolean()
  globalEnabled?: boolean;

  @ApiPropertyOptional({ description: '공통 시스템 프롬프트/페르소나 (null=해제)', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(8000)
  commonPrompt?: string | null;
}
