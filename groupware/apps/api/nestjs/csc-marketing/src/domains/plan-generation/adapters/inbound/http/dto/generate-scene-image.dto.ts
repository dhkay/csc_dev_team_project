import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ConceptChoiceDto } from '../../../../../../shared/adapters/inbound/http/dto';

/**
 * 씬 이미지 생성 요청: 선택 브랜드/컨셉과 씬의 시각 브리프로 이미지 1장 생성
 * organizationId 와 ownerUserId 는 BFF 가 세션에서 도출해 전달
 * ownerUserId 가 필요한 이유: 가장 비싼 동작이라 활동 원장에 누가 썼는지가 남아야 함
 * 스타일 앵커가 brand 만으로 결정되므로 같은 기획안 씬끼리 일관된 비주얼이 나옴
 */
export class GenerateSceneImageDto {
  @IsInt()
  organizationId: number;

  @IsInt()
  ownerUserId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  brandName: string;

  // 씬의 시각 브리프(PlanScene.imagePrompt): 자막/나레이션 의미는 여기 접혀 있다.
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  imagePrompt: string;

  // 소속 기획안 제목(선택): seed 계산에만. 프롬프트엔 넣지 않는다.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  proposalTitle?: string;

  // 재시도 변주(같은 씬의 다른 버전). 기본 0.
  @IsOptional()
  @IsInt()
  @Min(0)
  variant?: number;

  // 그 기획안을 만들 때 쓴 연출 축 조합(저장된 스냅샷). 생략하면 세트의 현재 조합
  // 보내는 이유: 조합이 생성 때 바뀌고 세트에 저장되지 않아 재조회하면 연출이 어긋남
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @ValidateNested({ each: true })
  @Type(() => ConceptChoiceDto)
  concepts?: ConceptChoiceDto[];
}
