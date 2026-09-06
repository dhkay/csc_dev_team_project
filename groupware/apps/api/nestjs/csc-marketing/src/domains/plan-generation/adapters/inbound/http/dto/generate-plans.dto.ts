import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { FOCUS_KEYWORD_MAX } from '../../../../core/domain';
import { ConceptChoiceDto } from '../../../../../../shared/adapters/inbound/http/dto';

/**
 * 기획서 생성 요청: 고른 목적 키워드와 선택 브랜드/컨셉으로 기획안 생성
 * 키워드는 저장하지 않고 요청에 실어 보내며, 개수는 사용자 선택이라 서비스가 범위 clamp
 * organizationId 와 ownerUserId 는 BFF 가 세션에서 도출해 전달
 * ownerUserId 가 필요한 이유: 가장 비싼 동작이라 활동 원장에 누가 썼는지가 남아야 함
 */
export class GeneratePlansDto {
  @IsInt()
  organizationId: number;

  @IsInt()
  ownerUserId: number;

  // 브랜드/컨셉 세트 이름. 빈 문자열 허용
  // 세트를 고르지 않는 입력 방식이 있어 @IsNotEmpty() 를 걸면 그 방식이 요청 경계에서 막힘
  @IsString()
  @MaxLength(2000)
  brandName: string;

  // 이번 생성에 쓸 목적 키워드(선택). 빈 배열이면 브랜드와 브랜드 설명이 주제가 됨
  // 무엇을 다룰지 정하지 않았을 때 기획안 자체가 소재를 제안하게 하는 쓰임
  @IsArray()
  @ArrayMaxSize(FOCUS_KEYWORD_MAX)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  purposeKeywords: string[];

  @IsInt()
  proposalCount: number;

  @IsInt()
  sceneCount: number;

  // 인포그래픽 배제: true 면 LLM 이 인포그래픽 씬을 만들지 않는다(기본 false)
  @IsOptional()
  @IsBoolean()
  excludeInfographic?: boolean;

  // 작업자가 직접 적은 씬 구성과 요구사항(선택)
  // 길이 상한 없음. 가는 곳이 기획 LLM 의 유저 프롬프트라 사람이 적을 만한 길이에 걸릴 상한이 없음
  @IsOptional()
  @IsString()
  sceneBrief?: string;

  // 피해야 할 것을 직접 적은 제한사항(선택). `sceneBrief` 와 짝이고 상한도 같이 없다.
  @IsOptional()
  @IsString()
  constraints?: string;

  // 이번 생성에만 쓸 연출 축 조합. 생략하면 세트에 저장된 조합
  // 세트를 고치지 않음(실험 한 번이 설정에 남으면 원래 조합을 잃음). 쓴 조합은 기획안 저장 시 함께 저장
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @ValidateNested({ each: true })
  @Type(() => ConceptChoiceDto)
  concepts?: ConceptChoiceDto[];
}
