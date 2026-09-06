import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ConceptChoiceDto } from '../../../../../../shared/adapters/inbound/http/dto';
import {
  BRAND_CONCEPT_KEY_MAX_LEN,
  BRAND_CONCEPT_MAX_SETS,
  BRAND_CONCEPT_TEXT_MAX_LEN,
  CONCEPT_MAX_PER_SET,
  CUSTOM_AXES_MAX_PER_SET,
  CUSTOM_DESCRIPTION_MAX_LEN,
  CUSTOM_LABEL_MAX_LEN,
  CUSTOM_OPTIONS_MAX_PER_SET,
} from '../../../../core/domain';

/** 세트가 스스로 더한 카테고리(축) 하나. key 형식 검증은 서비스 정규화 담당 */
export class CustomConceptAxisDto {
  @IsString()
  @MaxLength(BRAND_CONCEPT_KEY_MAX_LEN)
  key: string;

  @IsString()
  @MaxLength(CUSTOM_LABEL_MAX_LEN)
  label: string;
}

/**
 * 세트가 스스로 더한 레퍼런스(옵션) 하나
 * label 과 description 은 그대로 프롬프트로 나가므로 길이를 여기서 제한
 */
export class CustomConceptOptionDto {
  // 기본 축 key 또는 같은 세트의 커스텀 축 key
  @IsString()
  @MaxLength(BRAND_CONCEPT_KEY_MAX_LEN)
  axis: string;

  @IsString()
  @MaxLength(BRAND_CONCEPT_KEY_MAX_LEN)
  key: string;

  @IsString()
  @MaxLength(CUSTOM_LABEL_MAX_LEN)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(CUSTOM_DESCRIPTION_MAX_LEN)
  description?: string;
}

/**
 * 브랜드/컨셉 한 세트. 브랜드명 없는 세트는 서비스에서 제거
 * 상한 숫자는 도메인 상수 사용(두 벌 적으면 한쪽만 고쳐질 때 값이 조용히 절단됨)
 */
export class BrandConceptSetDto {
  @IsString()
  @MaxLength(BRAND_CONCEPT_TEXT_MAX_LEN)
  brandName: string;

  @IsOptional()
  @IsString()
  @MaxLength(BRAND_CONCEPT_TEXT_MAX_LEN)
  brandDescription?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CONCEPT_MAX_PER_SET)
  @ValidateNested({ each: true })
  @Type(() => ConceptChoiceDto)
  concepts?: ConceptChoiceDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CUSTOM_AXES_MAX_PER_SET)
  @ValidateNested({ each: true })
  @Type(() => CustomConceptAxisDto)
  customAxes?: CustomConceptAxisDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CUSTOM_OPTIONS_MAX_PER_SET)
  @ValidateNested({ each: true })
  @Type(() => CustomConceptOptionDto)
  customOptions?: CustomConceptOptionDto[];
}

/**
 * 세트 하나의 연출 교체 저장(정의 + 그중 무엇을 골랐는지)
 * 브랜드명과 설명은 미변경이라 세트 목록 저장과 범위가 다름
 */
export class SetBrandConceptSetDetailDto {
  @IsInt()
  organizationId: number;

  // 저장 주체(조직유저) id. 그 사람이 보고 있는 도구 버전 슬롯에 저장
  @IsInt()
  ownerUserId: number;

  // 브랜드명이 세트 식별자(생성 경로도 이 이름으로 세트를 찾음)
  @IsString()
  @MaxLength(BRAND_CONCEPT_TEXT_MAX_LEN)
  brandName: string;

  @IsArray()
  @ArrayMaxSize(CUSTOM_AXES_MAX_PER_SET)
  @ValidateNested({ each: true })
  @Type(() => CustomConceptAxisDto)
  customAxes: CustomConceptAxisDto[];

  @IsArray()
  @ArrayMaxSize(CUSTOM_OPTIONS_MAX_PER_SET)
  @ValidateNested({ each: true })
  @Type(() => CustomConceptOptionDto)
  customOptions: CustomConceptOptionDto[];

  @IsArray()
  @ArrayMaxSize(CONCEPT_MAX_PER_SET)
  @ValidateNested({ each: true })
  @Type(() => ConceptChoiceDto)
  concepts: ConceptChoiceDto[];
}

/** 그 사람의 브랜드/컨셉 세트 목록 교체 저장. 빈 배열은 전체 삭제 */
export class SetBrandConceptDto {
  @IsInt()
  organizationId: number;

  // 저장 주체(조직유저) id. 그 사람이 보고 있는 도구 버전 슬롯에 저장
  @IsInt()
  ownerUserId: number;

  @IsArray()
  @ArrayMaxSize(BRAND_CONCEPT_MAX_SETS)
  @ValidateNested({ each: true })
  @Type(() => BrandConceptSetDto)
  sets: BrandConceptSetDto[];
}
