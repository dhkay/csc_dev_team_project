import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 개인 AI 모델 선택 저장: 역량(LLM/영상 생성/TTS)별 모델 id
 * 빈 문자열은 미지정, 값은 프론트 카탈로그의 모델 id(opaque)
 */
export class SetAiModelDto {
  @IsInt()
  organizationId: number;

  // 선택 주체(조직유저) id. BFF 가 세션에서 도출해 전달
  @IsInt()
  ownerUserId: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  llm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  video?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  videoMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  tts?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ttsVoice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ttsPitch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  image?: string;
}
