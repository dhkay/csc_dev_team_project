import { IsInt, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

/**
 * 조직 AI 어시스턴트 설정 수정 요청: organizationId 는 신뢰된 호출자(web-groupware BFF)가 세션에서 주입
 * defaultModel/promptAddition 는 null 로 보내면 해제(clear)
 */
export class UpdateOrganizationAssistantSettingsDto {
  @IsInt()
  organizationId!: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(64)
  defaultModel?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(8000)
  promptAddition?: string | null;
}
