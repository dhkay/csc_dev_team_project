import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 기획서 생성 프롬프트(작업자 편집 지침) 저장: 시스템 프롬프트의 편집 가능한 중간 부분
 * 빈 값이면 기본 지침으로 리셋. 고정 머리/꼬리(JSON 스키마)는 서버가 관리(편집 불가)
 */
export class SetPlanPromptDto {
  @IsInt()
  organizationId: number;

  // 저장하는 사람(조직유저) id. 응답 뷰에 표시되는 모델이 그 사람의 선택이라 필요하다.
  @IsInt()
  ownerUserId: number;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  instructions?: string;
}
