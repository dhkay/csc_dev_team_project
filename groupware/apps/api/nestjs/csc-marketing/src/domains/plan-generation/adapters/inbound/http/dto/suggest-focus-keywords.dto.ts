import { IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * 포커스 키워드 후보 생성 요청: 주제 한 줄로 검색 키워드 후보를 받음
 * 결과는 저장하지 않음(고른 뒤 채널 키워드 교체 저장이 별도)
 * organizationId 와 ownerUserId 는 BFF 가 세션에서 도출해 전달
 * ownerUserId 가 필요한 이유: 후보 생성에 쓰는 LLM 이 요청한 사람이 고른 모델
 */
export class SuggestFocusKeywordsDto {
  @IsInt()
  organizationId: number;

  @IsInt()
  ownerUserId: number;

  // 작업자가 넣은 주제 한 줄(예: '아기 엉덩이 발진')
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  seed: string;
}
